# حالة العمل — AI Agent State

آخر تحديث: M1 مكتملة (جلسة 1) — بانتظار القبول.

- الفرع: `vibe/motion-studio-ai-pro-4e7d27`
- المهمة الحالية: **M1 بوابة الجودة — منفَّذة، بانتظار القبول**

## ما تم

- إنشاء `docs/AGENT_PLAN.md` (الخطة الكاملة) و`docs/AGENT_STATE.md` (هذا الملف).
- إنشاء بوابة الجودة `e2e/quality-gate.mts`: فحص ffprobe (مدة ±0.2s، وجود audio
  stream، الدقة) + استخراج 5 إطارات PNG + قياس loudness عبر ebur128؛ فشل تلقائي
  عند صمت (أقل من −60 LUFS) أو مدة خاطئة أو دقة غير متطابقة.
- إضافة سكربت npm: `qa:gate` (الممرَّرات: الملف + --duration/--width/--height اختيارية).
- اختبار فعلي على عينة جديدة 30s مُصدَّرة لهذه المهمة، وعلى ملف معيب للتأكد أن
  البوابة تفشل فعلاً عند العيوب (صمت/مدة خاطئة).

## قرارات

- أداة ffmpeg/ffprobe تُكتشف من `FFMPEG_DIR` ثم `PATH` (في بيئة التطوير:
  `/tmp/ffmpegx/ffmpeg-7.0.2-amd64-static`).
- بوابة M1 تعمل خارج المتصفح (Node/tsx)؛ العيّنة تُصدَّر عبر مسار التصدير القائم
  في Chromium headless (سياق آمن على المنفذ 4210) — لا يُقبل بالبوابة أي ملف لم
  تُصدِّره الآلة نفسها.
- ربط البوابة في CI (بعد e2e:render) سيُفعَّل داخل مهمة لاحقة لكي تبقى M1 مركزة.

## الملفات المعدّلة

- `docs/AGENT_PLAN.md`, `docs/AGENT_STATE.md`, `e2e/quality-gate.mts`,
  `package.json` (سكربت `qa:gate`).

## الخطوة التالية

بعد قبول M1: **M2** — صوت MediaRecorder عبر MediaStreamAudioDestinationNode
مدمج مع canvas.captureStream في MediaStream واحد؛ القبول: ffprobe يُظهر صوتاً
مسموعاً.
