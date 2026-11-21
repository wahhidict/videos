// استوديو الصوت — مكتبة مجانية مصنّعة محلياً + رفع + تسجيل + TTS (Piper على الحاسوب).

import { useRef, useState } from "react";
import { uid, type AudioTrack } from "@msaipro/core";
import { useApp } from "../store/appState";
import { putAsset } from "../store/storage";
import { listAudioLibrary, createTrackFromLibrary, collectPlanSfxTracks } from "../audio/sfx";
import { audioCtx, playTrackPreview } from "../audio/engine";
import { onDesktop } from "../export/desktop";

const sfxLib = listAudioLibrary();

async function blobTrack(blob: Blob, name: string, role: AudioTrack["role"]): Promise<AudioTrack | null> {
  try {
    const buf = await audioCtx().decodeAudioData(await blob.arrayBuffer());
    const assetId = uid("ast");
    await putAsset(assetId, blob);
    return {
      id: uid("trk"),
      assetId,
      name,
      role,
      startAt: 0,
      inPoint: 0,
      outPoint: Math.min(buf.duration, 3600),
      volume: role === "music" ? 0.35 : 0.9,
      fadeIn: 0,
      fadeOut: 0.2,
    };
  } catch {
    return null;
  }
}

export function AudioStudio() {
  const { doc, updateDoc, playhead, showToast, t, ai } = useApp();
  const [tab, setTab] = useState<"lib" | "rec" | "tts">("lib");
  const [recording, setRecording] = useState(false);
  const [ttsText, setTtsText] = useState("");
  const [ttsBusy, setTtsBusy] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const previewSrc = useRef<AudioBufferSourceNode | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recFileRef = useRef<HTMLInputElement | null>(null);
  if (!doc) return null;

  const total = doc.scenes.reduce((a, s) => a + s.duration, 0);

  const stopPreview = () => {
    try { previewSrc.current?.stop(); } catch { /* already stopped */ }
    previewSrc.current = null;
  };

  const addTrack = (track: AudioTrack) => {
    updateDoc((draft) => { draft.audio.push(track); });
    showToast(t("sfxGenerated"));
  };

  const addFromLibrary = async (itemId: string, role: "music" | "sfx") => {
    const track = await createTrackFromLibrary(itemId, playhead, role);
    if (track) addTrack(track);
  };

  const applyPlannedSfx = async () => {
    const tracks = await collectPlanSfxTracks(
      doc.meta?.plan,
      doc.scenes.map((s) => s.duration),
      doc.scenes.map((s) => s.id),
      doc.audio,
    );
    if (!tracks.length) { showToast(t("planSfxNone")); return; }
    updateDoc((draft) => { draft.audio.push(...tracks); });
    showToast(t("planSfxApplied") + " \u2014 " + tracks.length);
  };

  const previewLibrary = async (itemId: string, role: "music" | "sfx") => {
    stopPreview();
    const track = await createTrackFromLibrary(itemId, 0, role);
    if (!track) return;
    previewSrc.current = (await playTrackPreview(track)) ?? null;
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    const track = await blobTrack(file, file.name, file.size > 800_000 ? "music" : "sfx");
    if (!track) { showToast("تعذر قراءة الملف الصوتي"); return; }
    updateDoc((draft) => { draft.audio.push(track); });
    showToast("تمت إضافة الملف الصوتي");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      const parts: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(parts, { type: "audio/webm" });
        const track = await blobTrack(blob, `تسجيل ${new Date().toLocaleTimeString("ar")}`, "voice");
        if (track) addTrack(track);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      showToast("تعذر الوصول إلى الميكروفون");
    }
  };

  const stopRecording = () => {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  };

  const synthVoice = async () => {
    const text = ttsText.trim();
    if (!text) { showToast("اكتب نص التعليق الصوتي أولاً"); return; }
    setTtsBusy(true);
    try {
      const bridge = onDesktop() ? (globalThis as Record<string, unknown>).__MSAI_DESKTOP__ as { piperSpeak: (t: string, m: string) => Promise<Blob | null> } | undefined : undefined;
      const blob = bridge ? await bridge.piperSpeak(text, ai.piperModel) : null;
      if (blob && blob.size > 0) {
        const track = await blobTrack(blob, "تعليق Piper (مكتوب صوتياً)", "voice");
        if (track) addTrack(track);
        showToast("تم توليد الصوت محلياً عبر Piper");
      } else if ("speechSynthesis" in window) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "ar-SA";
        utter.rate = doc.voice.speed || 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
        showToast("معاينة صوت المتصفح — لإنشاء مسار صوتي داخل الفيديو استخدم زر التسجيل أو نسخة الحاسوب مع Piper");
      } else {
        showToast(t("noVoiceEngine"));
      }
    } finally {
      setTtsBusy(false);
    }
  };

  const patchTrack = (id: string, patch: Partial<AudioTrack>) => {
    updateDoc((draft) => {
      const track = draft.audio.find((tr) => tr.id === id);
      if (track) Object.assign(track, patch);
    });
  };

  const removeTrack = (id: string) => updateDoc((draft) => { draft.audio = draft.audio.filter((tr) => tr.id !== id); });

  return (
    <div>
      <div className="sidebar-tabs">
        {([["lib", t("soundEffects")], ["rec", t("recordings")], ["tts", t("voice")]] as const).map(([key, label]) => (
          <button key={key} className={`sidebar-tab ${tab === key ? "active" : ""}`} onClick={() => { setTab(key); stopPreview(); }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "lib" && (
        <>
          <div className="section-title" style={{ margin: "4px 0 6px" }}>المكتبة المجانية — مؤثرات وموسيقى مولّدة محلياً بترخيص حر (CC0-style: صُنعت داخل التطبيق)</div>
          <div className="row" style={{ marginBottom: 8 }}>
            <button className="btn small primary" onClick={() => void applyPlannedSfx()}>🎛️ {t("applyPlanSfx")}</button>
          </div>
          {(sfxLib.some((s) => s.kind === "music") ? ["music", "sfx"] : ["sfx"]).map((kind) => (
            <div key={kind}>
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>{kind === "music" ? t("music") : t("soundEffects")}</div>
              <div className="sfx-grid">
                {sfxLib.filter((s) => s.kind === kind).map((item) => (
                  <div key={item.id} className="template-card" style={{ padding: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>{item.nameAr}</div>
                    <div className="chip-row">
                      <button className="btn small" onClick={() => void previewLibrary(item.id, item.kind)}>▶ {t("play")}</button>
                      <button className="btn small primary" onClick={() => void addFromLibrary(item.id, item.kind)}>+ إضافة على {Math.max(0, playhead).toFixed(1)}ث</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            📁 {t("uploadAudio")}
            <div className="drop-note">MP3 أو WAV أو م4ا — يُخزَّن محلياً في جهازك</div>
          </div>
          <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => void onUpload(e.target.files?.[0])} />
        </>
      )}

      {tab === "rec" && (
        <>
          <div className="muted">سجّل تعليقاً صوتياً عبر الميكروفون. التسجيل يُحفظ داخل المشروع فقط.</div>
          {recording ? (
            <button className="btn danger" style={{ marginTop: 12 }} onClick={stopRecording}>⏹ {t("stopRecording")}</button>
          ) : (
            <button className="btn primary" style={{ marginTop: 12 }} onClick={() => void startRecording()}>🎙 {t("recordNow")}</button>
          )}
          <div className="upload-zone" onClick={() => recFileRef.current?.click()}>
            📁 إضافة تسجيل موجود من الجهاز
          </div>
          <input ref={recFileRef} type="file" accept="audio/*" hidden onChange={(e) => void onUpload(e.target.files?.[0])} />
        </>
      )}

      {tab === "tts" && (
        <>
          <div className="muted">
            توليد صوتي محلي: على نسخة ويندوز يُستخدم محرك Piper بعد تثبيته من صفحة الإعدادات. في المتصفح تتوفر معاينة عبر صوت النظام.
          </div>
          <div className="prop-row" style={{ marginTop: 10 }}>
            <label>نص التعليق الصوتي</label>
            <textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder="اكتب هنا ما سيُقرأ بصوت آلي..." />
          </div>
          <button className="btn gold" disabled={ttsBusy} onClick={() => void synthVoice()}>
            {ttsBusy ? "جارٍ التوليد..." : `🔊 ${t("synthesizeVoice")}`}
          </button>
        </>
      )}

      {doc.audio.length > 0 && (
        <>
          <div className="divider" />
          <div className="section-title" style={{ margin: "0 0 8px" }}>مسارات الصوت ({doc.audio.length}) — المدة الكلية {total.toFixed(1)}ث</div>
          <div className="audio-entry-list">
            {doc.audio.map((track) => (
              <div key={track.id} className="track-row">
                <span title={track.role === "voice" ? t("voice") : track.role === "music" ? t("music") : t("soundEffects")}>
                  {track.role === "voice" ? "🎙" : track.role === "music" ? "🎵" : "✨"}
                </span>
                <span className="grow" style={{ fontWeight: 700 }}>{track.name}</span>
                <label style={{ fontSize: 12, color: "var(--muted)" }}>{t("volume")}
                  <input type="range" min={0} max={1.5} step={0.05} value={track.volume}
                    onChange={(e) => patchTrack(track.id, { volume: Number(e.target.value) })} style={{ width: 90, accentColor: "var(--accent)" }} />
                </label>
                <label style={{ fontSize: 12, color: "var(--muted)" }}>{t("trim")} من
                  <input type="number" min={0} step={0.1} value={track.inPoint} style={{ width: 60 }}
                    onChange={(e) => patchTrack(track.id, { inPoint: Math.max(0, Number(e.target.value)) })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--muted)" }}>يبدأ عند ث
                  <input type="number" min={0} step={0.1} value={track.startAt} style={{ width: 60 }}
                    onChange={(e) => patchTrack(track.id, { startAt: Math.max(0, Number(e.target.value)) })} />
                </label>
                <button className="btn small" onClick={async () => { stopPreview(); previewSrc.current = (await playTrackPreview(track)) ?? null; }}>▶</button>
                <button className="btn small danger" onClick={() => removeTrack(track.id)}>🗑</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
