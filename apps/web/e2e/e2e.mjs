// اختبار شامل من البداية للنهاية: يصنع فيديو حقيقياً عبر الواجهة ويتحقق من ملف MP4 فعلي.
// التشغيل: node apps/web/e2e/e2e.mjs  (بعد npm run build)

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PORT = 4173;
const APP_URL = `http://127.0.0.1:${PORT}/`;
const OUT_DIR = "/tmp/msai-e2e";

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

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  // 1) واجهة عربية RTL
  await page.goto(APP_URL);
  ok(await page.getAttribute("html", "dir") === "rtl", "الاتجاه RTL مفعّل");
  ok((await page.getAttribute("html", "lang")) === "ar", "اللغة الافتراضية عربية");
  ok(await page.getByText("إنشاء فيديو جديد").first().isVisible(), "بلاط إنشاء فيديو جديد ظاهر");

  // 2) إنشاء مشروع من المعالج
  await page.getByText("إنشاء فيديو جديد", { exact: false }).first().click();
  await page.waitForSelector("textarea");
  await page.fill("textarea", "فوائد شرب الماء — فيديو يشرح أهمية الماء للجسم يومياً");
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

  // 3) لوحة المشاهد بمشاهد فعلية
  await page.waitForSelector(".sb-card canvas", { timeout: 30000 });
  const cards = await page.locator(".sb-card").count();
  ok(cards >= 3, `لوحة المشاهد تحتوي ${cards} مشاهد (المطلوب ≥ 3)`);
  const thumbData = await page.locator(".sb-card canvas").first().evaluate((cnv) => {
    const ctx = cnv.getContext("2d");
    const d = ctx.getImageData(0, 0, cnv.width, Math.min(40, cnv.height)).data;
    let nonBlack = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] + d[i + 1] + d[i + 2] > 30) nonBlack++;
    }
    return nonBlack;
  });
  ok(thumbData > 100, `الصورة المصغّرة مرسومة فعلياً (${thumbData} بكسل غير أسود)`);

  // 4) فتح المحرر والتحقق من مناطقه
  await page.getByRole("button", { name: /افتح المحرر/ }).first().click();
  await page.waitForSelector(".editor");
  ok(await page.locator(".left-panel").isVisible(), "لوحة المكتبة اليسرى ظاهرة");
  ok(await page.locator(".center-panel canvas").first().isVisible(), "معاينة الفيديو في المنتصف");
  ok(await page.locator(".right-panel").isVisible(), "لوحة الخصائص اليمنى ظاهرة");
  ok(await page.locator(".timeline-panel").isVisible(), "خط الزمن في الأسفل");

  // 5) تبويبات المكتبة تعمل: إضافة نص ثم إلغاء إظهار الترجمة والعودة
  await page.getByRole("button", { name: "النصوص" }).click();
  await page.getByRole("button", { name: /إضافة نص/ }).first().click();
  await page.waitForTimeout(300);
  const layers = await page.locator(".layer-item").count();
  ok(layers >= 1, `إضافة نص أنشأت طبقة (${layers})`);
  await page.getByRole("button", { name: "الترجمة" }).click();
  ok(await page.getByText(/سطر/).first().isVisible(), "محرر الترجمة يعرض الأسطر");
  await page.getByRole("button", { name: "الصوت" }).click();
  ok(await page.getByText(/مكتبة مجانية|مسارات الصوت|مؤثرات/).first().isVisible(), "استوديو الصوت يفتح");

  // 6) التصدير إلى MP4 حقيقي
  await page.getByRole("button", { name: /تصدير الفيديو/ }).first().click();
  await page.waitForSelector(".modal");
  await page.locator(".modal select").first().selectOption({ label: /HD 720p/.source ? undefined : undefined }).catch(() => {});
  const sel = page.locator(".modal select").first();
  await sel.selectOption({ index: 0 });
  await page.locator(".modal select").nth(1).selectOption("24");
  const downloadPromise = page.waitForEvent("download", { timeout: 240000 });
  await page.locator(".modal button", { hasText: "تصدير الفيديو" }).last().click();
  const download = await downloadPromise;
  const mp4Path = `${OUT_DIR}/${download.suggestedFilename()}`;
  await download.saveAs(mp4Path);
  ok(existsSync(mp4Path), "تم تنزيل ملف الفيديو");

  const bytes = readFileSync(mp4Path);
  const sig = bytes.subarray(4, 8).toString("latin1");
  ok(sig === "ftyp", `التوقيع MP4 صحيح (ftyp): "${sig}"`);
  ok(bytes.length > 100_000, `حجم الملف معقول: ${(bytes.length / 1024).toFixed(0)} ك.ب`);
  const brand = bytes.subarray(8, 12).toString("latin1");
  console.log(`   معلومات: العلامة ${brand}، الحجم ${bytes.length} بايت`);

  // 7) الحفظ التلقائي واستعادة المشروع بعد إعادة التحميل
  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByText("مشاريعي السابقة").first().click();
  ok(await page.locator(".project-card").first().isVisible(), "المشروع موجود في المشاريع السابقة بعد إعادة التحميل");
  const name = await page.locator(".project-card h4").first().textContent();
  console.log(`   المشروع المحفوظ: ${name}`);

  // 8) تصدير مشروع JSON (ملف محمول)
  const jsonDownload = page.waitForEvent("download", { timeout: 20000 });
  await page.getByRole("button", { name: /تصدير JSON/ }).first().click();
  const jsonDl = await jsonDownload;
  const jsonPath = `${OUT_DIR}/${jsonDl.suggestedFilename()}`;
  await jsonDl.saveAs(jsonPath);
  const json = JSON.parse(readFileSync(jsonPath, "utf8"));
  ok(Array.isArray(json.scenes) && json.scenes.length >= 3, "تصدير JSON يعمل بمشاهد كاملة");
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
console.log("\n🎉 كل اختبارات إنشاء الفيديو الحقيقي نجحت");
process.exit(0);
