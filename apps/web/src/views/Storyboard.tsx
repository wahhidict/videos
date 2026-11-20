// لوحة المشاهد — مراجعة المشاهد المولّدة وتعديل نصوصها قبل فتح المحرر.

import { deleteScene, duplicateScene, formatTime, totalDuration } from "@msaipro/core";
import { useApp } from "../store/appState";
import { SceneThumb } from "../components/SceneThumb";

export function Storyboard() {
  const { doc, updateDoc, goto, setSceneIndex, setPlayhead, t, showToast } = useApp();
  if (!doc || !doc.scenes.length) {
    return (
      <div className="storyboard" style={{ padding: 40 }}>
        <h2>لا توجد مشاهد بعد</h2>
        <p className="muted">ابدأ بإنشاء فيديو جديد من الشاشة الرئيسية.</p>
        <button className="btn primary" onClick={() => goto("dashboard")}>← {t("back")}</button>
      </div>
    );
  }

  const patchScene = (i: number, patch: { title?: string; script?: string; duration?: number; voiceScript?: string }) => {
    updateDoc((draft) => {
      const scn = draft.scenes[i];
      if ("duration" in patch && patch.duration != null) {
        scn.duration = Math.max(0.5, Math.min(600, patch.duration));
        scn.script = scn.script;
      } else {
        Object.assign(scn, patch);
      }
      if (patch.script != null && patch.voiceScript == null) scn.voiceScript = patch.script;
    });
  };

  const openEditorAt = (i: number) => {
    setSceneIndex(i);
    setPlayhead(doc.scenes.slice(0, i).reduce((a, s) => a + s.duration, 0) + 0.05);
    goto("editor");
  };

  return (
    <div className="storyboard">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>{t("storyboard")}</h2>
          <p className="muted" style={{ marginBottom: 0 }}>{t("storyboardHint")}</p>
        </div>
        <div className="row">
          <span className="muted">{doc.scenes.length} مشهد — {formatTime(totalDuration(doc))}</span>
          <button className="btn" onClick={() => goto("wizard")}>↻ {t("regenerate")}</button>
          <button className="btn gold" onClick={() => openEditorAt(0)}>🗓 {t("openEditor")}</button>
        </div>
      </div>

      <div className="sb-grid">
        {doc.scenes.map((scn, i) => (
          <div key={scn.id} className="sb-card" onClick={() => openEditorAt(i)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") openEditorAt(i); }}>
            <SceneThumb doc={doc} sceneIndex={i} width={260} />
            <div className="sb-info">
              <div className="sb-title">مشهد {i + 1} — {scn.title}</div>
              <textarea
                className="sb-script-edit"
                value={scn.script}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => patchScene(i, { script: e.target.value })}
                style={{ width: "100%", minHeight: 56, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: 8, fontFamily: "inherit", fontSize: 13, resize: "vertical" }}
                aria-label={`نص المشهد ${i + 1}`}
              />
              <div className="row" style={{ marginTop: 8, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                <label className="muted" style={{ fontSize: 12 }}>
                  {t("sceneDuration")}
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={scn.duration}
                    onChange={(e) => patchScene(i, { duration: Number(e.target.value) })}
                    style={{ width: 62, marginInlineStart: 6 }}
                  />
                </label>
                <button className="btn small" onClick={() => { updateDoc((draft) => duplicateScene(draft, i)); showToast(t("duplicateScene")); }}>{t("duplicateScene")}</button>
                <button
                  className="btn small danger"
                  disabled={doc.scenes.length <= 1}
                  onClick={() => { updateDoc((draft) => deleteScene(draft, i)); showToast(t("deleteScene")); }}
                >🗑</button>
              </div>
              <div className="sb-dur">{scn.layers.length} طبقة</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
