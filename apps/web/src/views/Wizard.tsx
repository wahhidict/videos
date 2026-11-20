// المعالج الموجّه: 6 خطوات — الفكرة، النوع، المدة، النمط البصري، الصوت، إنشاء.

import { useRef, useState } from "react";
import type { AudioTrack, StyleId, VideoTypeId } from "@msaipro/core";
import {
  DURATIONS,
  VIDEO_TYPES,
  VISUAL_STYLES,
  autoSubtitles,
  buildDocFromScript,
  generateArabicScript,
  splitScriptIntoLines,
  uid,
} from "@msaipro/core";
import { useApp } from "../store/appState";
import { takeWizardInit } from "../store/wizardInit";
import { ollamaScript } from "../ai/ollama";
import { putAsset } from "../store/storage";
import { onDesktop } from "../export/desktop";

const STEP_KEYS = ["stepIdea", "stepType", "stepDuration", "stepStyle", "stepVoice", "generate"] as const;

export function Wizard() {
  const { doc, setDoc, goto, t, ai, showToast } = useApp();

  const init = useRef(takeWizardInit());
  const [step, setStep] = useState(0);
  const [name, setName] = useState(init.current?.name || t("newVideo"));
  const [subject, setSubject] = useState("");
  const [typeId, setTypeId] = useState<VideoTypeId | null>(init.current?.presetType ?? null);
  const [durationId, setDurationId] = useState<string>("1min");
  const [customSeconds, setCustomSeconds] = useState(90);
  const [styleId, setStyleId] = useState<StyleId | null>(null);
  const [voiceMode, setVoiceMode] = useState<"male" | "female" | "none" | "upload">("male");
  const [voiceBlob, setVoiceBlob] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const voiceFileRef = useRef<HTMLInputElement | null>(null);

  const targetSeconds = durationId === "custom"
    ? Math.max(10, Math.min(900, customSeconds))
    : DURATIONS.find((d) => d.id === durationId)?.seconds ?? 60;

  const generate = async () => {
    if (!doc) return;
    if (!subject.trim()) { showToast("اكتب فكرة الفيديو أولاً"); setStep(0); return; }
    if (!typeId) { showToast("اختر نوع الفيديو"); setStep(1); return; }
    if (!styleId) { showToast("اختر النمط البصري"); setStep(3); return; }
    setBusy(true);
    try {
      const typeNameAr = VIDEO_TYPES.find((v) => v.id === typeId)?.nameAr ?? "";
      let lines: string[] | null = null;
      let usedAI = false;

      if (ai.ollamaEnabled && init.current?.mode !== "text") {
        try {
          showToast(t("aiBusy"));
          lines = await ollamaScript(
            { url: ai.ollamaUrl, model: ai.ollamaModel || "llama3.1" },
            subject,
            typeNameAr,
            Math.max(3, Math.min(24, Math.round(targetSeconds / 12))),
          );
          usedAI = true;
        } catch {
          showToast("تعذر الاتصال بالمحرك المحلي — استخدمنا القوالب الجاهزة بدلاً منه");
        }
      }

      if (!lines) {
        if (init.current?.mode === "text") {
          lines = splitScriptIntoLines(subject);
        } else {
          lines = splitScriptIntoLines(generateArabicScript(subject, typeId, targetSeconds).lines.join("\n"));
        }
      }
      if (!lines.length) lines = generateArabicScript(subject, typeId, Math.min(60, targetSeconds)).lines;

      const built = buildDocFromScript(doc, lines, styleId, typeId);
      built.name = name || built.name;
      built.voice = {
        mode: voiceMode === "none" ? "none" : voiceMode === "upload" ? "upload" : ai.piperEnabled && onDesktop() ? "piper" : "system",
        voice: voiceMode === "female" ? "ar_female" : voiceMode === "male" ? "ar_male" : null,
        speed: 1,
      };

      if (voiceMode === "upload" && voiceBlob) {
        const assetId = uid("ast");
        await putAsset(assetId, voiceBlob);
        const track: AudioTrack = {
          id: uid("trk"),
          assetId,
          name: "تسجيلك الصوتي",
          role: "voice",
          startAt: 0,
          inPoint: 0,
          outPoint: null,
          volume: 1,
          fadeIn: 0,
          fadeOut: 0.3,
        };
        built.audio.push(track);
      }

      built.subtitles = autoSubtitles(built);
      built.subtitleStyle.enabled = true;

      setDoc(built);
      goto("storyboard");
      showToast(`تم إنشاء ${built.scenes.length} مشهداً${usedAI ? " بمساعدة الذكاء الاصطناعي المحلي" : ""}`);
    } finally {
      setBusy(false);
    }
  };

  if (!doc) return null;

  const next = () => setStep((s) => Math.min(5, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const choiceProps = (onSelect: () => void) => ({
    role: "button" as const,
    tabIndex: 0,
    onClick: onSelect,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") onSelect(); },
  });

  return (
    <div className="wizard">
      <h2>{t("wizardTitle")}</h2>
      <p className="muted">كل شيء يعمل محلياً ومجاناً — بدون حساب ولا بطاقة بنكية.</p>
      <div className="steps">
        {STEP_KEYS.map((key, i) => (
          <span key={key} className={`step-chip ${i === step ? "active" : ""}`}>
            {i + 1}. {t(key)}
          </span>
        ))}
      </div>

      {step === 0 && (
        <>
          <div className="prop-row">
            <label>اسم المشروع</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="prop-row">
            <label>{init.current?.mode === "text" ? "النص الكامل (كل سطر = مشهد)" : "فكرة الفيديو أو السكربت"}</label>
            <textarea value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("ideaPlaceholder")} style={{ minHeight: 150 }} />
          </div>
          {init.current?.mode !== "text" && (
            <p className="muted">مثال: «فوائد شرب الماء — فيديو يشرح أهمية الماء للجسم بأسلوب مبسّط».</p>
          )}
        </>
      )}

      {step === 1 && (
        <div className="choice-grid">
          {VIDEO_TYPES.map((vt) => (
            <div key={vt.id} className={`choice ${typeId === vt.id ? "selected" : ""}`} {...choiceProps(() => setTypeId(vt.id))}>
              <b>{vt.nameAr}</b>
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <>
          <div className="choice-grid">
            {DURATIONS.map((d) => (
              <div key={d.id} className={`choice ${durationId === d.id ? "selected" : ""}`} {...choiceProps(() => setDurationId(d.id))}>
                <b>{d.nameAr}</b>
              </div>
            ))}
          </div>
          {durationId === "custom" && (
            <div className="prop-row" style={{ marginTop: 14 }}>
              <label>{t("customDuration")} — من 10 إلى 900 {t("seconds")}</label>
              <input type="number" min={10} max={900} value={customSeconds} onChange={(e) => setCustomSeconds(Number(e.target.value))} />
            </div>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <div className="choice-grid">
            {VISUAL_STYLES.map((st) => (
              <div key={st.id} className={`choice ${styleId === st.id ? "selected" : ""}`} {...choiceProps(() => setStyleId(st.id))}>
                <b>{st.nameAr}</b>
              </div>
            ))}
          </div>
          <p className="muted">سيتم تلقائياً اختيار حركات وخلفيات وألوان متناسقة حسب النمط المختار.</p>
        </>
      )}

      {step === 4 && (
        <>
          <div className="choice-grid">
            {([
              ["male", t("voice_male")],
              ["female", t("voice_female")],
              ["none", t("voice_none")],
              ["upload", t("voice_upload")],
            ] as const).map(([value, label]) => (
              <div key={value} className={`choice ${voiceMode === value ? "selected" : ""}`} {...choiceProps(() => setVoiceMode(value))}>
                <b>{label}</b>
              </div>
            ))}
          </div>
          {voiceMode === "upload" && (
            <>
              {voiceBlob && <p className="muted">الملف المحدد: <b style={{ color: "var(--text)" }}>{voiceBlob.name}</b></p>}
              <div className="upload-zone" onClick={() => voiceFileRef.current?.click()}>🎙 اختر ملف الصوت (MP3 أو WAV أو M4A)</div>
              <input ref={voiceFileRef} type="file" accept="audio/*" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setVoiceBlob(f); }} />
            </>
          )}
          {voiceMode !== "none" && voiceMode !== "upload" && (
            <p className="muted">
              {ai.piperEnabled
                ? onDesktop()
                  ? "سيُستخدم صوت Piper المحلي بعد إنشاء المشاهد."
                  : "افتح نسخة ويندوز لاستخدام Piper محلياً — أو أضف تسجيلك من استوديو الصوت."
                : "بدون محرك محلي ستتمكن لاحقاً من معاينة الصوت عبر النظام أو تسجيل صوتك من استوديو الصوت."}
            </p>
          )}
        </>
      )}

      {step === 5 && (
        <>
          <div className="section-title">ملخص الفيديو</div>
          <ul className="muted" style={{ lineHeight: 2.2 }}>
            <li>الاسم: <b style={{ color: "var(--text)" }}>{name}</b></li>
            <li>الفكرة: <b style={{ color: "var(--text)" }}>{subject.slice(0, 90) || "—"}</b></li>
            <li>النوع: <b style={{ color: "var(--text)" }}>{VIDEO_TYPES.find((v) => v.id === typeId)?.nameAr ?? "—"}</b></li>
            <li>المدة المستهدفة: <b style={{ color: "var(--text)" }}>{targetSeconds} {t("seconds")}</b></li>
            <li>النمط: <b style={{ color: "var(--text)" }}>{VISUAL_STYLES.find((s) => s.id === styleId)?.nameAr ?? "—"}</b></li>
            <li>الصوت: <b style={{ color: "var(--text)" }}>{voiceMode === "male" ? t("voice_male") : voiceMode === "female" ? t("voice_female") : voiceMode === "none" ? t("voice_none") : voiceBlob ? `${t("voice_upload")}: ${voiceBlob.name}` : t("voice_upload")}</b></li>
          </ul>
          <p className="muted">بالمتابعة يتم توليد السكربت والمشاهد والترجمة تلقائياً، ثم تظهر لوحة المشاهد قبل التصدير النهائي.</p>
        </>
      )}

      <div className="wizard-footer">
        <button className="btn" disabled={busy} onClick={step === 0 ? () => goto("dashboard") : back}>← {t("back")}</button>
        {step < 5 && <button className="btn primary" onClick={next}>{t("next")} →</button>}
        {step === 5 && (
          <button className="btn gold" style={{ fontSize: 17 }} disabled={busy} onClick={() => void generate()}>
            {busy ? `⏳ ${t("generatingScript")}` : `✨ ${t("generate")}`}
          </button>
        )}
      </div>
    </div>
  );
}
