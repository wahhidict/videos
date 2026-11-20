// المعالج الموجّه: 6 خطوات — الفكرة، النوع، المدة، النمط البصري، الصوت، إنشاء.

import { useRef, useState } from "react";
import type { AudioTrack, ScenePlan, StyleId, VideoTypeId } from "@msaipro/core";
import {
  DURATIONS,
  VIDEO_TYPES,
  VISUAL_STYLES,
  autoSubtitles,
  buildDocFromPlan,
  deriveTopic,
  estimateDurationFromText,
  extractTitleSafe,
  planSceneCount,
  planStoryboard,
  sanitizeContent,
  scaleDurations,
  splitScriptIntoLines,
  uid,
} from "@msaipro/core";
import { useApp } from "../store/appState";
import { takeWizardInit } from "../store/wizardInit";
import { ollamaScript } from "../ai/ollama";
import { putAsset } from "../store/storage";
import { onDesktop } from "../export/desktop";
import {
  applyVoiceover,
  generateVoiceover,
  piperAvailable,
  type VoiceGeneration,
} from "../voice/voiceover";

const STEP_KEYS = ["stepIdea", "stepType", "stepDuration", "stepStyle", "stepVoice", "generate"] as const;

/** Convert script lines (Ollama or explicit user text) into structured scene plans. */
function linesToPlans(lines: string[], targetSeconds: number): ScenePlan[] {
  const count = planSceneCount(targetSeconds);
  const scenes: ScenePlan[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = sanitizeContent(raw.replace(/\s+/g, " ").trim());
    if (!line || seen.has(line)) continue;
    seen.add(line);
    const onScreen = line.length > 90 ? `${line.slice(0, 88).trim()}…` : line;
    scenes.push({
      title: extractTitleSafe(line),
      onScreen,
      voiceover: line,
      visual: "يبني من نص السكربت",
      duration: estimateDurationFromText(line),
      kind: scenes.length === 0 ? "title" : "point",
    });
    if (scenes.length >= count) break;
  }
  scaleDurations(scenes, targetSeconds);
  return scenes;
}

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
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "busy">("idle");
  const [voiceProgress, setVoiceProgress] = useState("");

  const targetSeconds = durationId === "custom"
    ? Math.max(10, Math.min(900, customSeconds))
    : DURATIONS.find((d) => d.id === durationId)?.seconds ?? 60;

  const generate = async () => {
    if (!doc) return;
    if (!subject.trim()) { showToast("\u0643\u062a\u0628 \u0641\u0643\u0631\u0629 \u0627\u0644\u0641\u064a\u062f\u064a\u0648 \u0623\u0648\u0644\u0627\u064b"); setStep(0); return; }
    if (!typeId) { showToast("\u0627\u062e\u062a\u0631 \u0646\u0648\u0639 \u0627\u0644\u0641\u064a\u062f\u064a\u0648"); setStep(1); return; }
    if (!styleId) { showToast("\u0627\u062e\u062a\u0631 \u0627\u0644\u0646\u0645\u0637 \u0627\u0644\u0628\u0635\u0631\u064a"); setStep(3); return; }
    setBusy(true);
    try {
      const wantsVoice = voiceMode === "male" || voiceMode === "female";
      const piperUsable = wantsVoice && ai.piperEnabled && onDesktop();
      const typeNameAr = VIDEO_TYPES.find((v) => v.id === typeId)?.nameAr ?? "";
      let plan: { topic: string; targetSeconds: number; scenes: ScenePlan[] } | null = null;
      let usedAI = false;

      if (ai.ollamaEnabled && init.current?.mode !== "text") {
        try {
          showToast(t("aiBusy"));
          const lines = await ollamaScript(
            { url: ai.ollamaUrl, model: ai.ollamaModel || "llama3.1" },
            subject,
            typeNameAr,
            planSceneCount(targetSeconds),
          );
          plan = {
            topic: deriveTopic(subject),
            targetSeconds,
            scenes: linesToPlans(lines, targetSeconds),
          };
          usedAI = true;
        } catch {
          showToast("\u062a\u0639\u0630\u0651\u0631 \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0628\u0627\u0644\u0645\u062d\u0631\u0643 \u0627\u0644\u0645\u062d\u0644\u064a \u2014 \u0627\u0633\u062a\u062e\u062f\u0645\u0646\u0627 \u0627\u0644\u0642\u0648\u0627\u0644\u0628 \u0627\u0644\u062c\u0627\u0647\u0632\u0629 \u0628\u062f\u0644\u0627\u064b \u0645\u0646\u0647");
        }
      }

      if (!plan) {
        if (init.current?.mode === "text") {
          plan = {
            topic: subject.split(/[\n\u060c.]/)[0] || subject,
            targetSeconds,
            scenes: linesToPlans(splitScriptIntoLines(subject), targetSeconds),
          };
        } else {
          plan = planStoryboard(subject, typeId, targetSeconds);
        }
      }

      const built = buildDocFromPlan(doc, plan, styleId, typeId, subject.trim());
      built.name = name || built.name;
      built.voice = {
        mode: voiceMode === "none" ? "none" : voiceMode === "upload" ? "upload" : piperUsable ? "piper" : "system",
        voice: voiceMode === "female" ? "ar_female" : voiceMode === "male" ? "ar_male" : null,
        speed: 1,
      };

      if (voiceMode === "upload" && voiceBlob) {
        const assetId = uid("ast");
        await putAsset(assetId, voiceBlob);
        const track: AudioTrack = {
          id: uid("trk"),
          assetId,
          name: "\u062a\u0633\u062c\u064a\u0644\u0643 \u0627\u0644\u0635\u0648\u062a\u064a",
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

      setVoiceStatus(piperUsable ? "busy" : "idle");
      let voiceResult: VoiceGeneration | null = null;
      if (built.voice.mode === "piper") {
        if (!(await piperAvailable())) {
          voiceResult = null;
        } else {
          voiceResult = await generateVoiceover(
            built.scenes.map((sc) => ({ id: sc.id, voiceScript: sc.voiceScript, plannedDuration: sc.duration })),
            {
              model: ai.piperModel,
              onProgress: (done, total) => setVoiceProgress(`${done}/${total}`),
            },
          );
          if (voiceResult.ok) applyVoiceover(built, voiceResult);
        }
      }
      setVoiceStatus("idle");

      built.subtitles = autoSubtitles(built);
      built.subtitleStyle.enabled = true;

      setDoc(built);
      goto("storyboard");
      if (built.voice.mode === "piper" && !voiceResult) {
        showToast(t("voiceGenMissing"));
      } else if (voiceResult && !voiceResult.ok) {
        showToast(t("voiceGenFailed"));
      } else if (voiceResult) {
        showToast(t("voiceGenDone").replace("@n", String(voiceResult.generated)));
      } else {
        showToast(t("scenesCreated").replace("@n", String(built.scenes.length)).replace("@ai", usedAI ? t("withLocalAI") : ""));
      }
    } finally {
      setBusy(false);
    }
  };

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
            {busy ? (voiceStatus === "busy" ? `🎙 ${t("voiceGenBusy")} ${voiceProgress}` : `⏳ ${t("generatingScript")}`) : `✨ ${t("generate")}`}
          </button>
        )}
      </div>
    </div>
  );
}
