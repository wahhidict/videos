// اختبار شامل من البداية للنهاية: 6 سيناريوهات إنتاج إلزامية (A–F) عبر الواجهة،
// مع فحوص لوحة المشاهد (عدد/مدة/تكرار/تسريب)، تراجع وإعادة وأوامر لغة طبيعية،
// وتصدير MP4 حقيقي يُفحص بتوقيعه ومدته عبر ffmpeg.
// التشغيل: node apps/web/e2e/e2e.mjs  (بعد npm run build)

import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PORT = 4173;
const APP_URL = `http://127.0.0.1:${PORT}/`;
const OUT_DIR = "/tmp/msai-e2e";
const LEAK_PATTERNS = ["أنشئ", "اصنع", "اجعل", "استخدم", "فيديو", "موسيقى", "تعليق صوتي", "موشن", "بأسلوب"];

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failures++;
};

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  stdio: "pipe",
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("preview server timeout")), 30000);
  server.stdout.on("data", (d) => { if (String(d).includes("4173")) { clearTimeout(timer); resolve(); } });
  server.stderr.on("data", (d) => process.stderr.write(d));
  server.on("exit", () => reject(new Error("preview exited")));
});

function probeMp4(path) {
  const bytes = readFileSync(path);
  const sig = bytes.subarray(4, 8).toString("latin1");
  const idx = bytes.indexOf(Buffer.from("mvhd"));
  let dur = null;
  if (idx > 0) {
    const version = bytes[idx + 4] === 0 || bytes[idx + 4] === 1 ? bytes[idx + 4] : 0;
    const timescale = version === 0 ? bytes.readUInt32BE(idx + 16) : bytes.readUInt32BE(idx + 24);
    const d = version === 0 ? bytes.readUInt32BE(idx + 20) : Number(bytes.readBigUInt64BE(idx + 28));
    if (timescale) dur = d / timescale;
  }
  const hasAudio = bytes.includes(Buffer.from("mp4a")) || bytes.includes(Buffer.from("opus")) || bytes.includes(Buffer.from("Opus"));
  const codec = bytes.includes(Buffer.from("avc1")) ? "h264" : bytes.includes(Buffer.from("hvc1")) || bytes.includes(Buffer.from("hev1")) ? "h265" : bytes.includes(Buffer.from("vp09")) ? "vp9" : null;
  return { sig, dur, hasAudio, codec, bytes };
}

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function readLatestDoc() {
  return page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem("msaipro.projects") || "[]");
    const top = list[0];
    if (!top) return null;
    const raw = localStorage.getItem(`msaipro.autosave.${top.id}`);
    return raw ? JSON.parse(raw) : null;
  });
}

async function createProject(idea, { type, duration, style }) {
  await page.goto(APP_URL);
  await page.getByText("إنشاء فيديو جديد", { exact: false }).first().click();
  await page.waitForSelector("textarea");
  await page.fill("textarea", idea);
  await page.getByRole("button", { name: /التالي/ }).click();
  await page.getByText(type, { exact: true }).first().click();
  await page.getByRole("button", { name: /التالي/ }).click();
  await page.getByText(duration, { exact: false }).first().click();
  await page.getByRole("button", { name: /التالي/ }).click();
  await page.getByText(style, { exact: false }).first().click();
  await page.getByRole("button", { name: /التالي/ }).click();
  await page.getByText("بدون صوت", { exact: false }).first().click();
  await page.getByRole("button", { name: /التالي/ }).click();
  await page.getByRole("button", { name: /إنشاء الفيديو/ }).click();
  await page.waitForSelector(".sb-card canvas", { timeout: 45000 });
  await page.waitForTimeout(1500);
}

function checkStoryboard(label, doc, { minScenes, maxScenes, targetSeconds, tolerance }) {
  const scenes = doc.scenes;
  const total = scenes.reduce((a, s) => a + s.duration, 0);
  ok(scenes.length >= minScenes && scenes.length <= maxScenes, `${label}: عدد المشاهد ${scenes.length} ضمن النطاق ${minScenes}-${maxScenes}`);
  ok(Math.abs(total - targetSeconds) <= tolerance, `${label}: المدة ${total.toFixed(1)}s ضمن ±${tolerance}s من ${targetSeconds}s`);
  const spoken = scenes.map((s) => (s.voiceScript || s.script).trim());
  const dups = scenes.length - new Set(spoken).size;
  ok(dups === 0, `${label}: بلا مشاهد مكررة (${dups} مكررات)`);
  const onScreen = scenes.flatMap((s) => s.layers.filter((l) => l.kind === "text").map((l) => l.text));
  const leaks = [...spoken, ...onScreen].flatMap((text) => LEAK_PATTERNS.filter((p) => text.includes(p)).map((p) => p));
  ok(leaks.length === 0, `${label}: بلا تسريب تعليمات (${leaks.length})`);
  return { onScreens: spoken, total };
}

async function exportMp4(label, minSeconds, maxSeconds) {
  await page.getByRole("button", { name: /افتح المحرر/ }).first().click();
  await page.waitForSelector(".editor");
  await page.getByRole("button", { name: /تصدير الفيديو/ }).first().click();
  await page.waitForSelector(".modal");
  await page.locator(".modal select").first().selectOption({ index: 0 });
  await page.locator(".modal select").nth(1).selectOption("24");
  const downloadPromise = page.waitForEvent("download", { timeout: 300000 });
  await page.locator(".modal button", { hasText: "تصدير الفيديو" }).last().click();
  const download = await downloadPromise;
  const mp4Path = `${OUT_DIR}/${label.replace(/\s+/g, "-")}.mp4`;
  await download.saveAs(mp4Path);
  ok(existsSync(mp4Path), `${label}: تم تنزيل الملف`);
  const { sig, dur, hasAudio, codec } = probeMp4(mp4Path);
  ok(sig === "ftyp", `${label}: التوقيع MP4 صحيح (ftyp)`);
  if (dur != null) {
    ok(dur >= minSeconds && dur <= maxSeconds, `${label}: مدة الملف ${dur.toFixed(1)}s ضمن النطاق ${minSeconds}-${maxSeconds}s`);
  } else {
    ok(false, `${label}: تعذّر استخراج المدة من mvhd`);
  }
  console.log(`${hasAudio ? "ℹ️" : "⚠️"} ${label}: مسار صوتي ${hasAudio ? "موجود" : "غير موجود"}، الترميز ${codec ?? "غير معروف"} (بدون صوت مطلوب في هذه السيناريوهات)`);
  return mp4Path;
}

try {
  // 1) واجهة عربية RTL
  await page.goto(APP_URL);
  ok(await page.getAttribute("html", "dir") === "rtl", "الاتجاه RTL مفعّل");
  ok((await page.getAttribute("html", "lang")) === "ar", "اللغة الافتراضية عربية");

  // ══ A) وثائقي 60ث احترافي ══
  await createProject("رحلة الماء من السحاب إلى الأرض — كيف تتشكل الأمطار وتغذي الأنهار والبشر", { type: "وثائقي", duration: "دقيقة", style: "احترافي" });
  const docA = await readLatestDoc();
  const A = checkStoryboard("A وثائقي", docA, { minScenes: 4, maxScenes: 12, targetSeconds: 60, tolerance: 3 });
  ok(A.onScreens.every((t) => t.length > 0), "A: كل مشهد يحتوي نصاً");
  await exportMp4("A", 55, 66);

  // ══ B) إعلاني 30ث سينمائي ══
  await createProject("إعلان لساعة عربية فاخرة تُصنع يدوياً في دبي بتفاصيل ذهبية", { type: "إعلاني", duration: "30 ثانية", style: "سينمائي" });
  const docB = await readLatestDoc();
  const B = checkStoryboard("B إعلاني", docB, { minScenes: 3, maxScenes: 8, targetSeconds: 30, tolerance: 2 });
  await exportMp4("B", 27, 34);

  // ══ C) تعليمي 60ث إنفوغرافيك ══
  await createProject("أنواع الغذاء المفيدة لصحة القلب مع شرح مبسط للدهون والسكريات", { type: "تعليمي", duration: "دقيقة", style: "إنفوغرافيك" });
  const docC = await readLatestDoc();
  checkStoryboard("C تعليمي", docC, { minScenes: 4, maxScenes: 12, targetSeconds: 60, tolerance: 3 });
  await exportMp4("C", 55, 66);

  // ══ D) قصة سينمائية 30ث ══
  await createProject("قصة فتى يبحث عن نجمة مفقودة في صحراء واسعة ويجد الصداقة", { type: "قصصي", duration: "30 ثانية", style: "سينمائي" });
  const docD = await readLatestDoc();
  const D = checkStoryboard("D قصة", docD, { minScenes: 3, maxScenes: 8, targetSeconds: 30, tolerance: 2 });
  // ثبات الهوية البصرية: نفس الخلفية عبر المشاهد في أسلوب سينمائي
  const bgColors = new Set(docD.scenes.map((s) => s.background?.color));
  ok(bgColors.size <= 3, `D: اتساق ألوان الخلفية (${bgColors.size} ألوان ≤ 3)`);
  await exportMp4("D", 27, 34);

  // ══ E) مالي 60ث ══
  await createProject("تحليل أسعار الذهب في السوق المحلي والعلاقة بالدولار والفائدة", { type: "محتوى مالي", duration: "دقيقة", style: "بسيط وأنيق" });
  const docE = await readLatestDoc();
  checkStoryboard("E مالي", docE, { minScenes: 4, maxScenes: 12, targetSeconds: 60, tolerance: 3 });
  await exportMp4("E", 55, 66);

  // ══ F) يوتيوب/توتوريال 60ث تقني ══
  await createProject("شرح لوحة تحكم موقع ووردبريس للمبتدئين خطوة بخطوة", { type: "يوتيوب", duration: "دقيقة", style: "تقني" });
  const docF = await readLatestDoc();
  checkStoryboard("F توتوريال", docF, { minScenes: 4, maxScenes: 12, targetSeconds: 60, tolerance: 3 });
  await exportMp4("F", 55, 66);

  // ══ تراجع/إعادة + أوامر لغة طبيعية في المحرر ══
  await page.goto(APP_URL);
  await page.getByText("إنشاء فيديو جديد", { exact: false }).first().click();
  await page.waitForSelector("textarea");
  await page.fill("textarea", "فوائد شرب الماء يومياً");
  await page.getByRole("button", { name: /التالي/ }).click();
  await page.getByText("تعليمي", { exact: true }).first().click();
  await page.getByRole("button", { name: /التالي/ }).click();
  await page.getByText("30 ثانية", { exact: false }).first().click();
  await page.getByRole("button", { name: /التالي/ }).click();
  await page.getByText("إنفوغرافيك", { exact: false }).first().click();
  await page.getByRole("button", { name: /التالي/ }).click();
  await page.getByText("بدون صوت", { exact: false }).first().click();
  await page.getByRole("button", { name: /التالي/ }).click();
  await page.getByRole("button", { name: /إنشاء الفيديو/ }).click();
  await page.waitForSelector(".sb-card canvas", { timeout: 45000 });
  await page.getByRole("button", { name: /افتح المحرر/ }).first().click();
  await page.waitForSelector(".editor");
  await page.waitForTimeout(1500);

  const scenesBefore = (await readLatestDoc()).scenes.length;

  // أمر لغة طبيعية: خلفية
  const cmdInput = page.locator("input[placeholder*='أمر باللغة الطبيعية']");
  await cmdInput.fill("غيّر لون الخلفية إلى الأزرق الداكن");
  await cmdInput.press("Enter");
  await page.waitForTimeout(1500);
  const docCmd = await readLatestDoc();
  ok(docCmd.scenes.every((s) => s.background?.color === "#10214b"), "أمر ⌐الأزرق الداكن⌐ طُبّق على كل الخلفيات");

  // تراجع
  await page.getByRole("button", { name: /تراجع/ }).click();
  await page.waitForTimeout(1300);
  const docUndo = await readLatestDoc();
  ok(!docUndo.scenes.every((s) => s.background?.color === "#10214b"), "التراجع أعاد الخلفيات السابقة");
  ok(docUndo.scenes.length === scenesBefore, `التراجع حرص على العدد ${docUndo.scenes.length} = ${scenesBefore}`);

  // إعادة
  await page.getByRole("button", { name: /إعادة/ }).click();
  await page.waitForTimeout(1300);
  const docRedo = await readLatestDoc();
  ok(docRedo.scenes.every((s) => s.background?.color === "#10214b"), "الإعادة أعدت تطبيق اللون");

  // حذف المشهد الثالث (تأكيد على الحوار الظاهر)
  page.once("dialog", (d) => d.accept());
  await cmdInput.fill("احذف المشهد الثالث");
  await cmdInput.press("Enter");
  await page.waitForTimeout(1500);
  const docDel = await readLatestDoc();
  ok(docDel.scenes.length === scenesBefore - 1, `أمر حذف المشهد الثالث أعطى ${docDel.scenes.length} مشاهد (${scenesBefore - 1} مطلوب)`);
  // تراجع عن الحذف
  await page.getByRole("button", { name: /تراجع/ }).click();
  await page.waitForTimeout(1300);
  const docDeUndo = await readLatestDoc();
  ok(docDeUndo.scenes.length === scenesBefore, "التراجع أعاد المشهد المحذوف");

  // 7) حفظ تلقائي واستعادة
  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByText("مشاريعي السابقة").first().click();
  ok(await page.locator(".project-card").first().isVisible(), "المشروع موجود في المشاريع السابقة بعد إعادة التحميل");
} catch (e) {
  failures++;
  console.error("❌ فشل السيناريو:", e.message);
  try { await page.screenshot({ path: `${OUT_DIR}/failure.png`, fullPage: true }); } catch { /* ignore */ }
  console.error("أخطاء الصفحة:", errors.slice(0, 10));
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (failures > 0) {
  console.error(`\nعدد الإخفاقات: ${failures}`);
  process.exit(1);
}
console.log("\n🎉 كل اختبارات الاستخدام الحقيقي الستة (A–F) + التراجع والأوامر نجحت");
process.exit(0);
