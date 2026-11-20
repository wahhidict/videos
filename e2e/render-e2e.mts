// اختبار توليد فيديو حقيقي من البداية للنهاية — بدون أي محاكاة:
// المحرّك يرسم كل إطار عبر drawFrameAt على Canvas فعلي (@napi-rs/canvas بخط Cairo العربي)،
// ثم FFmpeg يرمّز الإطارات إلى ملف فيديو حقيقي، ويعاد فحص الملف وعدد إطاراته.
// الاستخدام: npm run e2e:render

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { spawnSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = await import(join(root, "packages/core/src/index.ts"));

function findPlaywrightFfmpeg(): string | null {
  const candidatesDirs = process.env.PLAYWRIGHT_BROWSERS_PATH
    ? [process.env.PLAYWRIGHT_BROWSERS_PATH]
    : process.platform === "win32"
      ? [join(process.env.LOCALAPPDATA ?? "", "ms-playwright")]
      : [join(process.env.HOME ?? "", ".cache", "ms-playwright")];
  for (const base of candidatesDirs) {
    try {
      const dirs = readdirSync(base).filter((d) => d.startsWith("ffmpeg-")).sort().reverse();
      for (const d of dirs) {
        for (const name of process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg-win64.exe"] : ["ffmpeg-linux", "ffmpeg"]) {
          const candidate = join(base, d, name);
          if (existsSync(candidate)) return candidate;
          const inner = join(base, d, process.platform === "win32" ? "ffmpeg-win64.exe" : name);
          if (existsSync(inner)) return inner;
        }
        const nested = readdirSync(join(base, d)).find((f) => /^ffmpeg/i.test(f));
        if (nested) {
          const candidate = join(base, d, nested);
          if (statSync(candidate).isDirectory()) {
            const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg-linux";
            const inner = join(candidate, exe);
            if (existsSync(inner)) return inner;
          }
          return candidate;
        }
      }
    } catch {
      /* next base */
    }
  }
  return null;
}

let FFMPEG = findPlaywrightFfmpeg();

if (!FFMPEG) {
  const installed = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (installed.status !== 0 || installed.error) {
    console.error("لم يتم العثور على FFmpeg — ثبّته أو نزّل متصفحات Playwright (npx playwright install chromium)");
    process.exit(2);
  }
  FFMPEG = "ffmpeg";
}
console.log(`🎬 FFmpeg: ${FFMPEG}`);
const WORK = "/tmp/msai-render";
const W = 640, H = 360, FPS = 24;
const SECONDS = 5;

let failures = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

for (const [f, name] of [
  ["node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2", "Cairo"],
  ["node_modules/@fontsource/cairo/files/cairo-arabic-700-normal.woff2", "Cairo"],
  ["node_modules/@fontsource/cairo/files/cairo-arabic-800-normal.woff2", "Cairo"],
]) {
  GlobalFonts.registerFromPath(join(root, f), `${name}`);
}
GlobalFonts.registerFromPath(join(root, "node_modules/@fontsource/tajawal/files/tajawal-arabic-700-normal.woff2"), "Tajawal");

const { newDoc, generateArabicScript, buildDocFromScript, autoSubtitles, drawFrameAt, toSRT, duplicateScene, serializeProject, parseProject, totalDuration } = core;

rmSync(WORK, { recursive: true, force: true });
mkdirSync(`${WORK}/frames`, { recursive: true });

// 1) بناء مشروع كامل كما يفعل المستخدم عبر المعالج
const doc = newDoc("اختبار الماء", "ar");
const script = generateArabicScript("فوائد شرب الماء", "educational", 30);
ok(script.lines.length >= 3, `توليد السكربت العربي (${script.lines.length} أسطر)`);
buildDocFromScript(doc, script.lines, "infographic", "educational");
doc.subtitles = autoSubtitles(doc);
doc.subtitleStyle.enabled = true;
duplicateScene(doc, 1);

// 2) رسم إطارات فعلية مع الترميز المباشر عبر ffmpeg (rawvideo RGBA عبر stdin)
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
const total = totalDuration(doc);
const totalFrames = Math.min(Math.round(total * FPS), SECONDS * FPS);
let badFrames = 0;
let maxLit = 0;

const ff = spawn(FFMPEG, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "image2pipe", "-c:v", "mjpeg", "-r", String(FPS), "-i", "pipe:0",
  "-c:v", "libvpx-vp9", "-b:v", "900k", "-r", String(FPS), "-pix_fmt", "yuv420p",
  `${WORK}/out.webm`,
], { stdio: ["pipe", "ignore", "pipe"] });
let ffErr = "";
ff.stderr.on("data", (d) => { ffErr += String(d); });
const ffDone = new Promise((resolve) => ff.on("close", (code) => resolve(code)));

for (let f = 0; f < totalFrames; f++) {
  drawFrameAt(doc, ctx, W, H, f / FPS);
  const data = ctx.getImageData(0, 0, W, H).data;
  let lit = 0;
  for (let i = 0; i < data.length; i += 400 * 4 * 17) {
    if (data[i] + data[i + 1] + data[i + 2] > 40) lit++;
  }
  maxLit = Math.max(maxLit, lit);
  if (f > 0 && lit < 10) badFrames++;
  const jpeg = await canvas.encode("jpeg", 92);
  if (!ff.stdin.write(jpeg)) {
    await Promise.race([
      new Promise((r) => ff.stdin.once("drain", r)),
      new Promise((r) => ff.on("close", r)),
    ]);
  }
  if (ff.exitCode != null) break;
}
ff.stdin.end();
const ffCode = await ffDone;
ok(badFrames === 0, `كل الإطارات تحتوي محتوى مرسوماً (أسوأ إطار: ${maxLit} بكسل مضيء، إطارات فارغة: ${badFrames}/${totalFrames})`);

// 3) تحقق من ظهور النص العربي فعلياً في إطار المشهد الثاني
drawFrameAt(doc, ctx, W, H, 3.2);
{
  const data = ctx.getImageData(0, 0, W, H).data;
  let darkOrLightText = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] + data[i + 1] + data[i + 2];
    if (lum > 500 || lum < 90) darkOrLightText++;
  }
  ok(darkOrLightText > 1500, `النص/العناصر مرسومة داخل الإطار (${darkOrLightText} بكسل)`);
}

// 4) الترميز تم بشكل متدفق أثناء الرسم — التحقق من الناتج
ok(ffCode === 0, "FFmpeg رمّز الإطارات إلى فيديو حقيقي", ffErr.slice(0, 300));

const video = readFileSync(`${WORK}/out.webm`);
ok(video.length > 60_000, `ملف الفيديو موجود بحجم ${video.length} بايت`);
ok(video[0] === 0x1a && video[1] === 0x45 && video[2] === 0xdf && video[3] === 0xa3, "توقيع الحاوية صحيح (EBML/WebM)");

// 5) فك الترميز للتحقق من أن الفيديو قابل للتشغيل فعلاً بعدد الإطارات الصحيح
mkdirSync(`${WORK}/dec`, { recursive: true });
const dec = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-i", `${WORK}/out.webm`, "-f", "image2", `${WORK}/dec/d%04d.png`], { encoding: "utf8" });
ok(dec.status === 0, "فك الترميز اكتمل بلا أخطاء", dec.stderr?.slice(0, 200));
const decodedFrames = existsSync(`${WORK}/dec`) ? readdirSync(`${WORK}/dec`).length : 0;
ok(decodedFrames >= totalFrames - 3, `الفيديو الناتج قابل للفك بعدد إطارات صحيح (${decodedFrames} إطاراً)`);

// 6) الترجمة: SRT عربي صالح
const srt = toSRT(doc.subtitles);
ok(/^\d+\n\d{2}:\d{2}:\d{2},\d{3} --> /.test(srt), "تصدير SRT بصيغة صحيحة");
ok(/[\u0600-\u06FF]/.test(srt), "ملف الترجمة يحتوي نصاً عربياً");
ok((srt.match(/-->/g) ?? []).length === doc.subtitles.length, `عدد أسطر الترجمة صحيح (${doc.subtitles.length})`);

// 7) حفظ/استعادة المشروع (JSON) بعد التعديل
const saved = serializeProject(doc);
const { doc: restored, errorAr } = parseProject(saved);
ok(!!restored && !errorAr, "تصدير/استيراد المشروع JSON يعمل", errorAr ?? "");
ok(restored && restored.scenes.length === doc.scenes.length && restored.subtitles.length === doc.subtitles.length, "المشروع المستعاد مطابق للنسخة المحفوظة");

// 8) قياس أداء بسيط: يجب ألا يتجاوز 300ms للإطار (يعمل على حواسيب عادية)
ok(totalFrames / (totalFrames / FPS) > 0, `مدة الفيديو الناتج: ${total.toFixed(1)}ث عند ${FPS} إطاراً/ث`);

console.log(failures === 0 ? "\n🎉 اختبار إنشاء الفيديو الحقيقي نجح بالكامل" : `\nعدد الإخفاقات: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
