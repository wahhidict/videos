// M1 — بوابة الجودة: فحص ffprobe بعد كل تصدير (قراءة الواقع من الملف، لا ادعاء).
// الاستخدام: tsx e2e/quality-gate.mts <file.mp4> [--duration N] [--width W] [--height H]
//            [--frames-dir DIR] [--max-c]
// الفحوص: مدة ±0.2s (عند تمرير المتوقع)، وجود audio stream، الدقة،
//         5 إطارات PNG، loudness عبر ebur128 — فشل تلقائي عند صمت (< −60 LUFS).
// الأداة تُكتشف من FFMPEG_DIR ثم PATH.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface ProbeArgs {
  file: string;
  duration?: number;
  width?: number;
  height?: number;
  framesDir?: string;
  maxC?: number;
}

function parseArgs(argv: string[]): ProbeArgs {
  const named = ["--duration", "--width", "--height", "--frames-dir", "--max-c"];
  const positional: string[] = [];
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (named.includes(argv[i])) {
      out[argv[i].slice(2)] = argv[i + 1] ?? "";
      i++;
    } else {
      positional.push(argv[i]);
    }
  }
  const file = positional[0];
  if (!file) fail(true, "الاستخدام: tsx e2e/quality-gate.mts <file.mp4> [--duration N --width W --height H]");
  return {
    file,
    duration: out.duration ? Number(out.duration) : undefined,
    width: out["width"] ? Number(out.width) : undefined,
    height: out.height ? Number(out.height) : undefined,
    framesDir: out["frames-dir"],
    maxC: out["max-c"] ? Number(out["max-c"]) : undefined,
  };
}

let exitCode = 0;
const lines: string[] = [];
function log(s: string): void {
  lines.push(s);
  console.error(s);
}
function fail(hard: boolean, msg: string): never {
  log(`✗ ${msg}`);
  exitCode = 1;
  if (hard) process.exit(1);
  throw new Error(msg);
}

function findBin(name: string): string {
  const dir = process.env.FFMPEG_DIR;
  const candidates = dir ? [join(dir, name)] : [];
  for (const c of candidates) if (existsSync(c)) return c;
  for (const d of (process.env.PATH ?? "").split(":")) {
    const p = join(d, name);
    if (existsSync(p)) return p;
  }
  return name;
}

function run(cmd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 120_000 });
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const ffprobe = findBin("ffprobe");
  const ffmpeg = findBin("ffmpeg");
  if (!existsSync(args.file)) fail(true, `الملف غير موجود: ${args.file}`);
  log(`— بوابة الجودة: ${args.file}`);

  const probe = run(ffprobe, [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", args.file,
  ]);
  if (probe.code !== 0) fail(true, `فحص ffprobe فشل: ${probe.stderr.split("\n")[0] ?? ""}`);
  const info = JSON.parse(probe.stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number; codec_name?: string; sample_rate?: string; channels?: number; nb_frames?: string; duration?: string }>;
  };
  if (!info.format || !info.streams) fail(true, "ffprobe أعاد مخرجات ناقصة — ملف تالف");

  const duration = Number(info.format.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) fail(true, "المدة مفقودة أو غير منطقية");
  log(`✓ المدة: ${duration.toFixed(3)}s`);
  if (args.duration !== undefined) {
    const diff = Math.abs(duration - args.duration);
    if (diff > 0.2) fail(false, `انحراف المدة ${diff.toFixed(3)}s يتجاوز ±0.2s (متوقع ${args.duration}s)`);
    else log(`✓ المدة ضمن ±0.2s (فرق ${diff.toFixed(3)}s)`);
  }

  const video = info.streams.find((s) => s.codec_type === "video");
  if (!video || !video.width || !video.height) fail(true, "لا يوجد مسار فيديو أو الدقة مفقودة");
  log(`✓ فيديو: ${video.codec_name} ${video.width}×${video.height}`);
  if (args.width !== undefined && video.width !== args.width) fail(false, `العرض ${video.width} ≠ ${args.width}`);
  if (args.height !== undefined && video.height !== args.height) fail(false, `الارتفاع ${video.height} ≠ ${args.height}`);

  const audio = info.streams.find((s) => s.codec_type === "audio");
  if (!audio) fail(false, "لا يوجد مسار صوت");
  else log(`✓ صوت: ${audio.codec_name} ${audio.sample_rate ?? "?"}Hz ${audio.channels ?? "?"}ch`);

  const framesDir = args.framesDir ?? mkdtempSync(join(tmpdir(), "qa-frames-"));
  mkdirSync(framesDir, { recursive: true });
  const frameTimes = [0.05, 0.25, 0.5, 0.75, 0.95].map((f) => Math.min(duration - 0.05, duration * f));
  for (let i = 0; i < frameTimes.length; i++) {
    const out = join(framesDir, `frame_${i}.png`);
    const r = run(ffmpeg, ["-y", "-ss", frameTimes[i].toFixed(2), "-i", args.file, "-frames:v", "1", out]);
    if (r.code !== 0 || !existsSync(out)) fail(false, `تعذّر استخراج الإطار ${i} عند ${frameTimes[i].toFixed(2)}s`);
    if (existsSync(out)) log(`✓ إطار ${i}/${frameTimes.length - 1}: ${out}`);
  }

  const loud = run(ffmpeg, ["-hide_banner", "-nostats", "-i", args.file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const matches = [...loud.stderr.matchAll(/I:\s+(-?[\d.]+)\s+LUFS/g)];
  const m = matches.length ? matches[matches.length - 1] : null;
  if (!m) fail(false, "تعذّر قياس loudness (ebur128)");
  else {
    const lufs = Number(m[1]);
    log(`✓ Loudness متكامل: ${m[1]} LUFS`);
    if (lufs < -60) fail(false, "المقطع الصوتي صامت فعلياً (أقل من −60 LUFS)");
  }

  if (exitCode !== 0) {
    log("بوابة الجودة: فشل");
    process.exit(1);
  }
  log("✓ بوابة الجودة: اجتازت كل الفحوص");
}

try {
  main();
} catch (e) {
  process.exit(1);
}
