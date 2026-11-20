// الإعدادات — مساعد إعداد الذكاء الاصطناعي المحلي + اللغة + معلومات الجهاز.

import { useEffect, useState } from "react";
import { useApp } from "../store/appState";
import { detectOllama, listOllamaModels } from "../ai/ollama";
import { onDesktop } from "../export/desktop";
import { formatBytes } from "@msaipro/core";

export function SettingsView() {
  const { ai, setAI, lang, setLang, t, showToast, isDesktop, goto } = useApp();

  const [ollamaStatus, setOllamaStatus] = useState<"unknown" | "ok" | "off">("unknown");
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!ai.ollamaEnabled) return;
    void (async () => {
      setTesting(true);
      const ok = await detectOllama(ai.ollamaUrl);
      setOllamaStatus(ok ? "ok" : "off");
      if (ok) setModels(await listOllamaModels(ai.ollamaUrl));
      setTesting(false);
    })();
  }, [ai.ollamaEnabled, ai.ollamaUrl]);

  const memGB = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 0;
  const cores = navigator.hardwareConcurrency ?? 0;

  const patchAI = (patch: Partial<typeof ai>) => setAI({ ...ai, ...patch });

  return (
    <div className="settings-page">
      <h2>⚙ {t("settings")}</h2>
      <p className="muted">{t("aiOptional")}</p>

      <div className="divider" />

      <h2 style={{ fontSize: 21 }}>🤖 {t("aiSetup")}</h2>

      <div className="ai-card">
        <div className="head">
          <b>{t("ollamaTitle")}</b>
          <span className={`badge ${ollamaStatus === "ok" ? "ok" : "off"}`}>
            {ollamaStatus === "ok" ? `✓ ${t("detected")}` : ollamaStatus === "off" ? t("notDetected") : `— ${testing ? "جارٍ الفحص" : "لم يُفحص بعد"}`}
          </span>
          <span style={{ flex: 1 }} />
          <label className="chip-row" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 13 }}>{t("aiEnabled")}</span>
            <input type="checkbox" checked={ai.ollamaEnabled} onChange={(e) => patchAI({ ollamaEnabled: e.target.checked })} />
          </label>
        </div>
        <div className="desc">
          ملفات نصية عربية: يقوم محرك Ollama على جهازك بتوليد سكربتات أفضل من القوالب. التثبيت اختياري تماماً.
        </div>
        <div className="kv"><span>{t("modelSize")}:</span> <b>نماذج عربية صغيرة 0.5–4 ج.ب مثل qwen2.5:0.5b</b></div>
        <div className="kv"><span>{t("storage")}:</span> <b>≈ {formatBytes(3.2 * 1024 * 1024 * 1024)} كحد أقصى</b></div>
        <div className="kv"><span>{t("requirements")}:</span> <b>{memGB ? `${memGB} ج.ب ذاكرة متاحة على جهازك` : "8 ج.ب ذاكرة مفضلة"} — تعمل بدون كرت رسومات</b></div>
        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ fontSize: 13.5, color: "var(--muted)" }}>{t("aiUrl")}
            <input type="text" value={ai.ollamaUrl} onChange={(e) => patchAI({ ollamaUrl: e.target.value })} style={{ width: 240 }} />
          </label>
          <label style={{ fontSize: 13.5, color: "var(--muted)" }}>{t("aiModel")}
            {models.length ? (
              <select value={ai.ollamaModel} onChange={(e) => patchAI({ ollamaModel: e.target.value })} style={{ width: 200 }}>
                <option value="">— اختر —</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input type="text" placeholder="qwen2.5:0.5b" value={ai.ollamaModel} onChange={(e) => patchAI({ ollamaModel: e.target.value })} style={{ width: 200 }} />
            )}
          </label>
          <button
            className="btn small"
            onClick={async () => {
              setTesting(true);
              const ok = await detectOllama(ai.ollamaUrl);
              setOllamaStatus(ok ? "ok" : "off");
              if (ok) {
                const list = await listOllamaModels(ai.ollamaUrl);
                setModels(list);
                showToast(`مكتشف ✓ — ${list.length ? `${list.length} نموذج: ${list.slice(0, 3).join("، ")}` : "لا نماذج مثبتة بعد"}`);
              } else {
                showToast("لم يتم العثور على Ollama — حمّله من ollama.com ثم ثبّت نموذجاً صغيراً");
              }
              setTesting(false);
            }}
          >{t("testBtn")}</button>
        </div>
        {ollamaStatus === "off" && (
          <p className="muted" style={{ marginTop: 8 }}>
            للتثبيت: نزّل Ollama من موقعه الرسمي ثم نفّذ  <code style={{ direction: "ltr", display: "inline-block" }}>ollama pull qwen2.5:0.5b</code>  — حجم النموذج حوالي 400 م.ب.
            لن يقوم التطبيق بتنزيل أي شيء تلقائياً دون موافقتك.
          </p>
        )}
      </div>

      <div className="ai-card">
        <div className="head">
          <b>{t("piperTitle")}</b>
          <span className={`badge ${ai.piperEnabled ? "ok" : "off"}`}>{ai.piperEnabled ? `✓ ${t("detected")}` : t("notDetected")}</span>
          <span style={{ flex: 1 }} />
          <label className="chip-row" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 13 }}>{t("aiEnabled")}</span>
            <input type="checkbox" checked={ai.piperEnabled} onChange={(e) => patchAI({ piperEnabled: e.target.checked })} />
          </label>
        </div>
        <div className="desc">توليد تعليق صوتي عربي محلي من ملفات نماذج Piper الصوتية (صوت رجالي/نسائي عربي، حوالي 60 م.ب لكل صوت).</div>
        <div className="kv"><span>{t("modelSize")}:</span> <b>≈ 60 م.ب لكل صوت</b></div>
        <div className="kv"><span>{t("requirements")}:</span> <b>أي حاسوب حديث — التشغيل خلال ثوانٍ</b></div>
        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ fontSize: 13.5, color: "var(--muted)" }}>{t("aiModel")}
            <input type="text" placeholder="ar_JO-kareem" value={ai.piperModel} onChange={(e) => patchAI({ piperModel: e.target.value })} style={{ width: 200 }} />
          </label>
          {!isDesktop && <span className="muted" style={{ fontSize: 13 }}>⚠ متاح فقط في نسخة ويندوز المتكاملة مع نظامك.</span>}
          <button
            className="btn small"
            onClick={async () => {
              if (!onDesktop()) { showToast("اختبار Piper متاح في نسخة ويندوز"); return; }
              const bridge = (globalThis as Record<string, unknown>).__MSAI_DESKTOP__ as { detectTools?: () => Promise<Record<string, boolean>> } | undefined;
              const tools = (await bridge?.detectTools?.()) ?? {};
              showToast(tools.piper ? "Piper مكتشف ✓" : "Piper غير مثبت — راجع دليل الإعداد");
            }}
          >{t("testBtn")}</button>
        </div>
      </div>

      <div className="ai-card">
        <div className="head">
          <b>{t("whisperTitle")}</b>
          <span className={`badge ${ai.whisperEnabled ? "ok" : "off"}`}>{ai.whisperEnabled ? `✓ ${t("detected")}` : t("notDetected")}</span>
          <span style={{ flex: 1 }} />
          <label className="chip-row" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 13 }}>{t("aiEnabled")}</span>
            <input type="checkbox" checked={ai.whisperEnabled} onChange={(e) => patchAI({ whisperEnabled: e.target.checked })} />
          </label>
        </div>
        <div className="desc">تحويل التسجيلات الصوتية إلى ترجمة نصية عربية/إنجليزية محلياً (whisper.cpp — نموذج صغير ≈ 150 م.ب).</div>
        <div className="kv"><span>{t("modelSize")}:</span> <b>≈ 75–500 م.ب حسب الدقة</b></div>
        <div className="kv"><span>{t("requirements")}:</span> <b>معالج رباعي النواة أو أفضل</b></div>
      </div>

      <div className="divider" />

      <div className="section-title">🖥 جهازك</div>
      <div className="kv"><span>الذاكرة المتاحة للمتصفح:</span> <b>{memGB ? `≈ ${memGB} ج.ب` : "غير معروضة"}</b></div>
      <div className="kv"><span>أنوية المعالج:</span> <b>{cores || "—"}</b></div>
      <div className="kv"><span>بيئة التشغيل:</span> <b>{isDesktop ? "تطبيق ويندوز (Tauri) — كامل الإمكانيات المحلية" : "متصفح ويب — التصدير يعمل داخل المتصفح، ونسخة ويندوز تضيف Piper وWhisper وFFmpeg"}</b></div>

      <div className="divider" />

      <div className="section-title">🌐 {t("language")}</div>
      <div className="row">
        <button className={`btn ${lang === "ar" ? "primary" : ""}`} onClick={() => setLang("ar")}>العربية</button>
        <button className={`btn ${lang === "en" ? "primary" : ""}`} onClick={() => setLang("en")}>English</button>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => goto("dashboard")}>← {t("back")}</button>
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        صورة الواجهة موجّهة تلقائياً مع اللغة (RTL للعربية). لا يتم إرسال أي بيانات إلى أي خادم — كل الإعدادات تُحفظ في جهازك.
      </p>
    </div>
  );
}
