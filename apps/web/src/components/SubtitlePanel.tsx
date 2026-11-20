// محرّر الترجمة — توقيت يدوي، توليد تلقائي من نص المشاهد، استيراد/تصدير SRT.

import { useRef } from "react";
import { autoSubtitles, fromSRT, toSRT, uid, type SubtitleCue } from "@msaipro/core";
import { useApp } from "../store/appState";
import { saveBlobAsFile } from "../export/desktop";

export function SubtitlePanel() {
  const { doc, updateDoc, playhead, showToast, t } = useApp();
  const srtRef = useRef<HTMLInputElement | null>(null);
  if (!doc) return null;

  const patchStyle = (patch: Partial<ProjectDocStyle>) =>
    updateDoc((draft) => { Object.assign(draft.subtitleStyle, patch); });

  const setEnabled = (enabled: boolean) => patchStyle({ enabled });

  const generateAuto = () => {
    const cues = autoSubtitles(doc);
    if (!cues.length) { showToast("لا يوجد نص في المشاهد لتوليد الترجمة"); return; }
    updateDoc((draft) => { draft.subtitles = cues; draft.subtitleStyle.enabled = true; });
    showToast(`تم توليد ${cues.length} سطر ترجمة تلقائياً`);
  };

  const patchCue = (id: string, patch: Partial<SubtitleCue>) =>
    updateDoc((draft) => {
      const cue = draft.subtitles.find((c) => c.id === id);
      if (cue) Object.assign(cue, patch);
      draft.subtitles.sort((a, b) => a.start - b.start);
    });

  const addCue = () => {
    updateDoc((draft) => {
      draft.subtitles.push({ id: uid("cue"), start: playhead, end: playhead + 2.5, text: "نص الترجمة" });
      draft.subtitles.sort((a, b) => a.start - b.start);
      draft.subtitleStyle.enabled = true;
    });
  };

  const deleteCue = (id: string) => updateDoc((draft) => { draft.subtitles = draft.subtitles.filter((c) => c.id !== id); });

  const importSrt = async (file: File | undefined) => {
    if (!file) return;
    try {
      const cues = fromSRT(await file.text());
      if (!cues.length) { showToast("تعذر قراءة ملف الترجمة"); return; }
      updateDoc((draft) => { draft.subtitles = cues; draft.subtitleStyle.enabled = true; });
      showToast(`تم استيراد ${cues.length} سطر`);
    } catch {
      showToast("تعذر قراءة ملف الترجمة");
    }
  };

  const exportSrt = () => {
    if (!doc.subtitles.length) { showToast("لا توجد ترجمة للتصدير"); return; }
    saveBlobAsFile(`${doc.name}.srt`, new Blob([toSRT(doc.subtitles)], { type: "text/plain;charset=utf-8" }));
  };

  return (
    <div>
      <div className="chip-row" style={{ marginBottom: 10 }}>
        <button className={`chip ${doc.subtitleStyle.enabled ? "active" : ""}`} onClick={() => setEnabled(!doc.subtitleStyle.enabled)}>
          {doc.subtitleStyle.enabled ? "✓ " : "☐ "}{t("enableSubtitles")}
        </button>
        <button className={`chip ${doc.subtitleStyle.animated ? "active" : ""}`} onClick={() => patchStyle({ animated: !doc.subtitleStyle.animated })}>
          {doc.subtitleStyle.animated ? "✓ " : "☐ "}{t("animatedCaptions")}
        </button>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn small primary" onClick={generateAuto}>✨ {t("autoSubtitles")}</button>
        <button className="btn small" onClick={() => srtRef.current?.click()}>⤴ {t("importSrt")}</button>
        <button className="btn small" onClick={exportSrt}>⤓ {t("exportSrt")}</button>
      </div>
      <input ref={srtRef} type="file" accept=".srt,text/plain" hidden onChange={(e) => void importSrt(e.target.files?.[0])} />

      <div className="row" style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12.5, color: "var(--muted)" }}>{t("changeColor")}
          <input type="color" value={doc.subtitleStyle.color} onChange={(e) => patchStyle({ color: e.target.value })} style={{ width: 44, height: 28, borderRadius: 6, border: "1px solid var(--border)", background: "transparent" }} />
        </label>
        <label style={{ fontSize: 12.5, color: "var(--muted)" }}>لون التمييز
          <input type="color" value={doc.subtitleStyle.highlightColor} onChange={(e) => patchStyle({ highlightColor: e.target.value })} style={{ width: 44, height: 28, borderRadius: 6, border: "1px solid var(--border)", background: "transparent" }} />
        </label>
        <label style={{ fontSize: 12.5, color: "var(--muted)" }}>الحجم
          <input type="number" min={14} max={140} value={doc.subtitleStyle.fontSize} onChange={(e) => patchStyle({ fontSize: Math.max(14, Number(e.target.value)) })} style={{ width: 60 }} />
        </label>
        <label style={{ fontSize: 12.5, color: "var(--muted)" }}>الموضع
          <input type="range" min={0.1} max={0.95} step={0.05} value={doc.subtitleStyle.position} onChange={(e) => patchStyle({ position: Number(e.target.value) })} style={{ width: 70, accentColor: "var(--accent)" }} />
        </label>
      </div>

      <div className="row" style={{ marginBottom: 6 }}>
        <button className="btn small" onClick={addCue}>+ سطر عند {playhead.toFixed(1)}ث</button>
        <span className="muted" style={{ fontSize: 12 }}>{doc.subtitles.length} سطر</span>
      </div>

      {doc.subtitles.length > 0 && (
        <table className="cue-table">
          <thead>
            <tr><th>{t("startTime")}</th><th>{t("endTime")}</th><th>{t("cueText")}</th><th /></tr>
          </thead>
          <tbody>
            {doc.subtitles.map((cue) => (
              <tr key={cue.id}>
                <td style={{ width: 62 }}><input type="number" step={0.1} value={cue.start} onChange={(e) => patchCue(cue.id, { start: Number(e.target.value) })} /></td>
                <td style={{ width: 62 }}><input type="number" step={0.1} value={cue.end} onChange={(e) => patchCue(cue.id, { end: Number(e.target.value) })} /></td>
                <td><input value={cue.text} onChange={(e) => patchCue(cue.id, { text: e.target.value })} style={{ direction: "rtl" }} /></td>
                <td style={{ width: 34 }} className="cue-text-actions"><button className="btn small danger" onClick={() => deleteCue(cue.id)}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface ProjectDocStyle {
  enabled: boolean;
  fontSize: number;
  color: string;
  highlightColor: string;
  position: number;
  animated: boolean;
}
