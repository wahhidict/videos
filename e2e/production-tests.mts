// الاختبارات الإلزامية الثلاثة لخط الإنتاج الحقيقي (سطر أوامر، بلا محاكاة):
// 1) تعليمي عربي 30 ثانية — إنفوغرافيك + تعليق صوتي Piper حقيقي.
// 2) إعلاني 30 ثانية — سينمائي.
// 3) وثائقي 60 ثانية — احترافي + تعليق صوتي + موسيقى.
// كل اختبار: خطة مشاهد فريدة بلا تسريب تعليمات، مدد متزامنة مع الصوت الفعلي،
// خلط صوتي حقيقي في node، ترميز MP4 (H.264+AAC+faststart)، ثم فحص فكّ الترميز والمستوى الصوتي.
// الاستخدام: npm run e2e:production

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = await import(pathToFileURL(join(root, "packages/core/src/index.ts")).href);
const OUT_DIR = process.env.PROD_OUT ?? "/workspace/production-tests-out";
const WORK = join(tmpdir(), "msai-prod");

const FFMPEG = process.env.ffmpeg_bin ?? join(process.env.HOME ?? "", ".local/bin/ffmpeg");
const FFPROBE = join(dirname(FFMPEG), "ffprobe");
const PIPER = process.env.piper_bin ?? "/tmp/piper/piper";
const PIPER_MODEL = process.env.piper_model ?? join(process.env.HOME ?? "", ".local/share/msaipro/voices/ar_JO-kareem-medium.onnx");

if (!existsSync(FFMPEG)) { console.error(`FFmpeg غير موجود: ${FFMPEG}`); process.exit(2); }
if (!existsSync(PIPER)) { console.error(`Piper غير موجود: ${PIPER}`); process.exit(2); }

for (const [f, name] of [
  ["node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2", "Cairo"],
  ["node_modules/@fontsource/cairo/files/cairo-arabic-700-normal.woff2", "Cairo"],
  ["node_modules/@fontsource/cairo/files/cairo-arabic-800-normal.woff2", "Cairo"],
]) GlobalFonts.registerFromPath(join(root, f), name);
GlobalFonts.registerFromPath(join(root, "node_modules/@fontsource/tajawal/files/tajawal-arabic-700-normal.woff2"), "Tajawal");

let failures = 0;
const ok = (cond: boolean, label: string, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures += 1;
};

const FFMPEG_ = FFMPEG;

function piperTts(text: string, outFile: string, lengthScale?: number): Promise<number> {
  const args = ["--model", PIPER_MODEL, "--output_file", outFile];
  if (lengthScale && Number.isFinite(lengthScale) && lengthScale > 0) args.push("--length_scale", String(lengthScale));
  return new Promise((resolve, reject) => {
    const child = spawn(PIPER, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.stdin.write(text);
    child.stdin.end();
    child.on("close", (code) => (code === 0 ? resolve(0) : reject(new Error(`piper exit ${code}`))));
    child.on("error", reject);
  });
}

interface WavInfo { sampleRate: number; channels: number; samples: Int16Array; }
function parseWav(bytes: Uint8Array): WavInfo | null {
  const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const d = dv(bytes);
  const str = (off: number, n: number) => String.fromCharCode(...bytes.subarray(off, off + n));
  if (bytes.length < 44 || str(0, 4) !== "RIFF" || str(8, 4) !== "WAVE") return null;
  let off = 12;
  let fmt = 0, channels = 0, rate = 0, bits = 0;
  while (off + 8 <= bytes.length) {
    const id = str(off, 4);
    const size = d.getUint32(off + 4, true);
    if (id === "fmt ") {
      fmt = d.getUint16(off + 8, true);
      channels = d.getUint16(off + 10, true);
      rate = d.getUint32(off + 12, true);
      bits = d.getUint16(off + 22, true);
      if (fmt === 0xfffe) fmt = d.getUint16(off + 32, true);
    } else if (id === "data") {
      const start = off + 8;
      const n = Math.min(size, bytes.length - start);
      const samples = new Int16Array(Math.floor(n / 2));
      for (let i = 0; i < samples.length; i += 1) samples[i] = d.getInt16(start + i * 2, true);
      return { sampleRate: rate, channels, samples };
    }
    off += 8 + size + (size % 2);
    void fmt; void bits;
  }
  return null;
}

function synthMusicWav(seconds: number, outFile: string): void {
  const rate = 22050;
  const n = Math.round(seconds * rate);
  const data = Buffer.alloc(44 + n * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + n * 2, 4); data.write("WAVE", 8);
  data.write("fmt ", 12); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(n * 2, 40);
  const notes = [220, 277.18, 329.63];
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const lfo = 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 0.25);
    let v = 0;
    for (const f of notes) v += Math.sin(2 * Math.PI * f * t) * (1 / notes.length);
    v *= lfo * 0.25;
    const fade = Math.min(1, t / 1.2, Math.max(0, (seconds - t) / 1.5));
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * fade * 32767))), 44 + i * 2);
  }
  writeFileSync(outFile, data);
}

/** Mix tracks into one 48 kHz stereo s16 WAV. */
async function mixTracks(
  tracks: { wavPath: string; startAt: number; volume: number; fadeIn: number; fadeOut: number; sourceRate: 22050 | 48000 }[],
  totalSec: number,
  outFile: string,
): Promise<void> {
  const outRate = 48000;
  const out = new Float64Array(Math.ceil(totalSec * outRate) * 2);
  for (const track of tracks) {
    const bytes = new Uint8Array(readFileSync(track.wavPath));
    const info = parseWav(bytes);
    if (!info) continue;
    const mono = info.channels === 1 ? info.samples : interleaveToMono(info.samples, info.channels);
    const srcRate = info.sampleRate;
    const startIdx = Math.round(track.startAt * outRate);
    const fadeOutSec = track.fadeOut;
    const durSec = mono.length / srcRate;
    for (let i = 0; i < mono.length; i += 1) {
      const tLocal = i / srcRate;
      const outIdx = startIdx + Math.round(i * (outRate / srcRate));
      if (outIdx + 1 >= out.length) break;
      let g = track.volume;
      if (track.fadeIn > 0 && tLocal < track.fadeIn) g *= tLocal / track.fadeIn;
      if (fadeOutSec > 0) {
        const remaining = durSec - tLocal;
        if (remaining < fadeOutSec) g *= Math.max(0, remaining / fadeOutSec);
      }
      const v = (mono[i] / 32768) * g;
      out[outIdx * 2] += v;
      out[outIdx * 2 + 1] += v;
    }
  }
  const n = out.length;
  const data = Buffer.alloc(44 + n * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + n * 2, 4); data.write("WAVE", 8);
  data.write("fmt ", 12); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(outRate, 24); data.writeUInt32LE(outRate * 4, 28);
  data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    const v = Math.max(-1, Math.min(1, out[i]));
    data.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(outFile, data);
}

function interleaveToMono(samples: Int16Array, channels: number): Int16Array {
  const frames = Math.floor(samples.length / channels);
  const mono = new Int16Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) sum += samples[i * channels + c];
    mono[i] = Math.round(sum / channels);
  }
  return mono;
}

function runFf(args: string[], inputPipe?: (stdin: NodeJS.WritableStream) => Promise<void>): Promise<{ code: number | null; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(FFMPEG_, args, { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    child.stderr?.on("data", (d) => { err += String(d); });
    let done: Promise<unknown> = Promise.resolve();
    if (inputPipe && child.stdin) done = inputPipe(child.stdin);
    void done.then(() => {
      if (inputPipe && child.stdin) child.stdin.end();
    });
    child.on("close", (code) => resolve({ code, err }));
    child.on("error", (e) => { err += String(e); resolve({ code: -1, err }); });
  });
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

const LEAK_WORDS = ["أنشئ", "اصنع", "اجعل", "استخدم", "بأسلوب", "فيديو موشن", "موشن جرافيك", "موسيقى", "تعليق صوتي", "رمز الفيديو"];

interface CaseDetails {
  name: string;
  idea: string;
  type: Parameters<typeof core.planStoryboard>[1];
  style: Parameters<typeof core.buildDocFromPlan>[2];
  seconds: number;
  withVoice: boolean;
  withMusic: boolean;
}

async function runCase(c: CaseDetails): Promise<void> {
  console.log(`\n🎬 ${c.name} (${c.seconds}ث)`);
  mkdirSync(join(WORK, c.name, "vo"), { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  let caseFailuresAtStart = failures;

  ok(c.seconds >= 10, "الإعداد صحيح");

  const plan = core.planStoryboard(c.idea, c.type, c.seconds);
  const expectedRange: [number, number] = c.seconds <= 45 ? [4, 6] : c.seconds <= 75 ? [6, 9] : [10, 18];
  ok(
    plan.scenes.length >= expectedRange[0] && plan.scenes.length <= expectedRange[1],
    `عدد المشاهد ضمن المدى الإرشادي (${plan.scenes.length} داخل ${expectedRange[0]}–${expectedRange[1]})`,
  );
  const keys = new Set(plan.scenes.map((s) => `${s.onScreen}|${s.voiceover}`));
  ok(keys.size === plan.scenes.length, `لا مشاهد مكررة (${keys.size}/${plan.scenes.length} فريدة)`);
  const leaked = plan.scenes.filter((s) => LEAK_WORDS.some((w) => s.onScreen.includes(w) || s.voiceover.includes(w)));
  ok(leaked.length === 0, "لا تسريب لتعليمات المستخدم في محتوى المشاهد", leaked.map((s) => s.onScreen).join(" / ").slice(0, 120));
  ok(plan.topic.length >= 3, `الموضوع المستخرج: «${plan.topic}»`);

  const doc = core.newDoc(c.name, "ar");
  core.buildDocFromPlan(doc, plan, c.style, c.type, c.idea);
  doc.voice.mode = c.withVoice ? "piper" : "none";

  const timings0 = core.sceneTimings(doc);
  void timings0;

  const voiceTracks: { wavPath: string; startAt: number; volume: number; fadeIn: number; fadeOut: number }[] = [];
  if (c.withVoice) {
    let generated = 0;
    for (let i = 0; i < doc.scenes.length; i += 1) {
      const scene = doc.scenes[i];
      const path = join(WORK, c.name, "vo", `vo${i}.wav`);
      try {
        const planned = scene.duration;
        const window = Math.max(1.6, planned - 0.65);
        await piperTts(scene.voiceScript, path);
        let dur = core.wavDurationSeconds(new Uint8Array(readFileSync(path)));
        if (dur && dur > window + 0.05) {
          const scale = Math.min(2.5, Math.max(1.0, (dur + 0.15) / window));
          const fast = join(WORK, c.name, "vo", `vo${i}-fit.wav`);
          const dur2 = await piperTts(scene.voiceScript, fast, 1 / scale)
            .then(() => core.wavDurationSeconds(new Uint8Array(readFileSync(fast))))
            .catch(() => 0);
          if (dur2 && dur2 < dur) {
            dur = dur2;
            copyFileSync(fast, path);
          }
        }
        if (!dur) throw new Error("wav measure failed");
        generated += 1;
        const tail = dur + 0.35;
        const startAt = doc.scenes.slice(0, i).reduce((a, s) => a + s.duration, 0);
        if (tail > scene.duration) scene.duration = Math.round(tail * 10) / 10;
        voiceTracks.push({ wavPath: path, startAt, volume: 0.95, fadeIn: 0, fadeOut: 0.15 });
      } catch (e) {
        ok(false, `توليد صوت المشهد ${i + 1} فشل`, String(e).slice(0, 100));
      }
    }
    ok(generated === doc.scenes.length, `تعليق صوتي Piper حقيقي لكل المشاهد (${generated}/${doc.scenes.length} WAV)`);
  }

  const total = core.totalDuration(doc);
  ok(Math.abs(total - c.seconds) / c.seconds < 0.15, `مجموع المدد يحترم الهدف (${total.toFixed(1)}ث مقابل ${c.seconds}ث)`);

  const timings = core.sceneTimings(doc);
  const syncOk = voiceTracks.every((tr, i) => Math.abs(tr.startAt - timings[i].start) < 0.02);
  ok(voiceTracks.length === 0 || syncOk, "بداية كل مقطع صوتي مطابقة لبداية مشهده");

  const musicWav = join(WORK, c.name, "music.wav");
  if (c.withMusic) {
    synthMusicWav(total, musicWav);
    voiceTracks.unshift({ wavPath: musicWav, startAt: 0, volume: 0.16, fadeIn: 0.5, fadeOut: 1.2 });
  }

  doc.subtitles = core.autoSubtitles(doc);
  doc.subtitleStyle.enabled = true;

  const mixWav = join(WORK, c.name, `mix.wav`);
  await mixTracks(voiceTracks.map((t) => ({ ...t, sourceRate: 22050 as const })), total, mixWav);

  const W = 960, H = 540, FPS = 25;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const totalFrames = Math.round(total * FPS);
  const mp4Path = join(OUT_DIR, `${c.name}.mp4`);

  const ff = runFf([
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-c:v", "mjpeg", "-r", String(FPS), "-i", "pipe:0",
    "-i", mixWav,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-movflags", "+faststart", "-shortest",
    mp4Path,
  ], async (stdin) => {
    for (let f = 0; f < totalFrames; f += 1) {
      core.drawFrameAt(doc, ctx, W, H, f / FPS);
      const jpeg = await canvas.encode("jpeg", 92);
      if (!stdin.write(jpeg)) {
        await new Promise((r) => stdin.once("drain", r));
      }
    }
  });
  const { code, err } = await ff;
  ok(code === 0, "ترميز MP4 (H.264+AAC+faststart) نجح", code !== 0 ? err.slice(0, 300) : "");

  if (existsSync(mp4Path)) {
    const probe = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "json", mp4Path], { encoding: "utf8" });
    let streams: any[] = [];
    let fmtDur = 0;
    try {
      const j = JSON.parse(probe.stdout ?? "{}");
      streams = j.streams ?? [];
      fmtDur = Number(j.format?.duration ?? 0);
    } catch { /* empty */ }
    const hasVideo = streams.some((s) => s.codec_type === "video" && s.codec_name === "h264");
    const hasAudio = streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac");
    ok(hasVideo && hasAudio, "MP4 يحتوي مجرى صورة H.264 ومجرى صوت AAC", JSON.stringify(streams.map((s) => [s.codec_type, s.codec_name])));
    ok(fmtDur > 0 && Math.abs(fmtDur - total) / total < 0.15, `مدة الملف الناتج مطابقة (${fmtDur.toFixed(1)}ث مقابل ${total.toFixed(1)}ث على الخط الزمني)`);

    const vol = spawnSync(FFMPEG_, ["-i", mp4Path, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
    const m = (vol.stderr ?? "").match(/mean_volume:\s*(-?[\d.]+) dB/);
    const mean = m ? Number(m[1]) : -99;
    if (c.withVoice || c.withMusic) {
      ok(mean > -50, `الصوت مسموع فعلاً (متوسط المستوى ${mean} dB)`);
    } else {
      ok(mean <= -50, `مسار الصوت موجود وسكوت مقصود (${mean} dB)`);
    }

    const decode = spawnSync(FFMPEG_, ["-v", "error", "-i", mp4Path, "-f", "null", "-"], { encoding: "utf8", timeout: 120000 });
    ok(decode.status === 0 && !(decode.stderr ?? "").trim(), "فكّ ترميز الملف كاملاً بلا أخطاء", (decode.stderr ?? "").slice(0, 200));

    console.log(`   📦 ${mp4Path}`);
    console.log(`   # الحجم: ${(readFileSync(mp4Path).length / 1024 / 1024).toFixed(2)} MB — SHA256: ${sha256(mp4Path)}`);
  }

  if (failures === caseFailuresAtStart) console.log(`🏆 ${c.name}: كل الفحوصات ناجحة`);
  else console.log(`⚠️ ${c.name}: ${failures - caseFailuresAtStart} فحص فاشل`);
}

const DIRTY = "أنشئ فيديو موشن جرافيك عن أهمية شرب الماء لمدة 30 ثانية، استخدم رسومات توضيحية متحركة، اجعل الفيديو ممتعاً بصرياً، مع تعليق صوتي عربي وموسيقى";

await runCase({
  name: "t1-educational-water-30s",
  idea: DIRTY,
  type: "educational",
  style: "infographic",
  seconds: 30,
  withVoice: true,
  withMusic: false,
});

await runCase({
  name: "t2-ad-cinematic-30s",
  idea: "أعلن عن وصفة شعر طبيعية بالزيوت العطرية، إعلان قصير مبهر",
  type: "ad",
  style: "cinematic",
  seconds: 30,
  withVoice: false,
  withMusic: false,
});

await runCase({
  name: "t3-documentary-city-60s",
  idea: "أخرج فيديو وثائقي احترافي عن مدينتي القديمة يشمل التاريخ والحرف اليدوية",
  type: "documentary",
  style: "professional",
  seconds: 60,
  withVoice: true,
  withMusic: true,
});

console.log(`\n${failures === 0 ? "النتيجة النهائية: كل الاختبارات الثلاثة ناجحة ✅" : `النتيجة النهائية: ${failures} فحصاً فاشلاً ❌`}`);
process.exit(failures === 0 ? 0 : 1);
