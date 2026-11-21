// الإعدادات — مساعد إعداد الذكاء الاصطناعي المحلي + اللغة + معلومات الجهاز.

import { useEffect, useState } from "react";
import { useApp } from "../store/appState";
import { detectOllama, listOllamaModels } from "../ai/ollama";
import {
  configureLLMGateway,
  hasLLMKey,
  maskedLLMKeyHint,
  getAIGateway,
  saveLLMKey,
} from "../ai/llm";
import { PROVIDER_REGISTRY, maskKey } from "@msaipro/core";
import { formatBytes } from "@msaipro/core";
import { ToolsManager } from "../components/ToolsManager";

const LLM_MODEL_HINTS: Record<string, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-haiku-latest"],
  google: ["gemini-2.0-flash", "gemini-1.5-flash"],
};

export function SettingsView() {
  const { ai, setAI, lang, setLang, t, showToast, isDesktop, goto } = useApp();

  const [ollamaStatus, setOllamaStatus] = useState<"unknown" | "ok" | "off">("unknown");
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [llmKeyInput, setLLMKeyInput] = useState("");
  const [llmConn, setLLMConn] = useState<"unknown" | "ok" | "off" | "busy">(
    hasLLMKey() && ai.llmProvider ? "ok" : "unknown",
  );

  useEffect(() => {
    configureLLMGateway(ai);
  }, [ai.llmProvider, ai.llmModel, ai.llmBudgetUsd, ai.llmBaseUrl]);

  const llmProviders = PROVIDER_REGISTRY.filter(
    (p) => p.capabilities.includes("text") && (p.requiresKey || p.id === "ollama"),
  );

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

      <h2 style={{ fontSize: 21 }}>🧠 المزوّد الذكي للإنتاج (اختياري — مدفوع)</h2>

      <div className="ai-card">
        <div className="head">
          <b>فهم السكريبت وتخطيط المشاهد بالنموذج اللغوي</b>
          <span className={`badge ${llmConn === "ok" ? "ok" : "off"}`}>
            {llmConn === "ok"
              ? `✓ ${t("detected")}${maskedLLMKeyHint() ? ` — ${maskedLLMKeyHint()}` : ""}`
              : llmConn === "off"
                ? "فشل الاختبار"
                : "— غير مثبّت بعد"}
          </span>
          <span style={{ flex: 1 }} />
        </div>
        <div className="desc">
          أدخل مفتاح مزوّد لغوي (OpenAI/Anthropic/Google) وسيُستخدم كوسيلة الذكاء الأساسية: فهم السكريبت كاملاً وتحويله إلى خطة إنتاج سينمائية منظمة.
          بدونه يعمل التطبيق بثبات محلي من المولّدات المدمجة وبنفس المخرجات النهائية.
          المفتاح يُحفظ في الذاكرة الجلسية فقط ولا يُكتب في أي ملف أو LocalStorage ويُمحى عند إغلاق التطبيق.
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ fontSize: 13.5, color: "var(--muted)" }}>
            المزوّد
            <select
              value={ai.llmProvider}
              onChange={(e) => {
                setAI({ ...ai, llmProvider: e.target.value, llmModel: LLM_MODEL_HINTS[e.target.value]?.[0] ?? "" });
                setLLMConn("unknown");
              }}
              style={{ width: 220 }}
            >
              <option value="">— دون نموذج (محلي فقط) —</option>
              {llmProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.nameAr}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13.5, color: "var(--muted)" }}>
            النموذج
            <input
              type="text"
              list="llm-model-hints"
              placeholder="gpt-4o-mini"
              value={ai.llmModel}
              onChange={(e) => patchAI({ llmModel: e.target.value })}
              style={{ width: 220 }}
            />
            <datalist id="llm-model-hints">
              {(LLM_MODEL_HINTS[ai.llmProvider] ?? []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label style={{ fontSize: 13.5, color: "var(--muted)" }}>
            {ai.llmProvider === "ollama" ? "عنوان Ollama" : "عنوان بديل (اختياري)"}
            <input
              type="text"
              placeholder={ai.llmProvider === "ollama" ? "http://localhost:11434" : "—"}
              value={ai.llmBaseUrl}
              onChange={(e) => patchAI({ llmBaseUrl: e.target.value })}
              style={{ width: 220 }}
            />
          </label>
        </div>
        {ai.llmProvider && ai.llmProvider !== "ollama" && (
          <div className="row" style={{ marginTop: 12 }}>
            <label style={{ fontSize: 13.5, color: "var(--muted)" }}>
              مفتاح API
              <input
                type="password"
                dir="ltr"
                placeholder="sk-... (جلسي فقط)"
                value={llmKeyInput}
                onChange={(e) => setLLMKeyInput(e.target.value)}
                style={{ width: 260 }}
              />
            </label>
            <button
              className="btn small"
              onClick={() => {
                saveLLMKey(llmKeyInput);
                setLLMKeyInput("");
                setLLMConn(hasLLMKey() ? "ok" : "unknown");
                showToast(hasLLMKey() ? "تم تثبيت المفتاح في الذاكرة الجلسية" : "أُفرغ المفتاح");
              }}
            >
              تثبيت المفتاح
            </button>
            <button
              className="btn small"
              disabled={llmConn === "busy" || !hasLLMKey()}
              onClick={async () => {
                setLLMConn("busy");
                try {
                  const result = await getAIGateway().testConnection("text");
                  setLLMConn(result.ok ? "ok" : "off");
                  showToast(result.message || (result.ok ? "الاختبار نجح" : "فشل الاختبار"));
                } catch (error) {
                  setLLMConn("off");
                  showToast((error as Error).message);
                }
              }}
            >
              اختبار الاتصال
            </button>
            <label style={{ fontSize: 13.5, color: "var(--muted)" }}>
              سقف الميزانية ($)
              <input
                type="number"
                min={0}
                step={0.5}
                value={ai.llmBudgetUsd}
                onChange={(e) => patchAI({ llmBudgetUsd: Number(e.target.value) })}
                style={{ width: 90 }}
              />
            </label>
          </div>
        )}
        {ai.llmProvider && !hasLLMKey() && ai.llmProvider !== "ollama" && (
          <p className="muted" style={{ marginTop: 8 }}>
            مثال تقديري للتكلفة لفيديو دقيقة بـ「gpt-4o-mini」: سترى رقمًا تقريبياً بالدولار قبل كل إرسال ولن يُرسَل شيء دون موافقتك الصريحة.
          </p>
        )}
        {ai.llmProvider === "ollama" && (
          <p className="muted" style={{ marginTop: 8 }}>
            Ollama محلي ومجاني — لا يحتاج مفتاحاً.
          </p>
        )}
      </div>

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

      <div className="divider" />

      <ToolsManager />

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
