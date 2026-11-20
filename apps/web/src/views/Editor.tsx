// المحرر البسيط: يسار المكتبة، المنتصف المعاينة، الأسفل خط الزمن، يمين الخصائص.

import { useState } from "react";
import { formatTime, totalDuration } from "@msaipro/core";
import { useApp } from "../store/appState";
import { PreviewPlayer } from "../components/PreviewPlayer";
import { LibraryPanel } from "../components/LibraryPanel";
import { PropertiesPanel } from "../components/PropertiesPanel";
import { Timeline } from "../components/Timeline";
import { ExportDialog } from "../components/ExportDialog";
import { saveProject } from "../store/storage";

export function Editor() {
  const { doc, goto, updateDoc, t, showToast } = useApp();
  const [exportOpen, setExportOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  if (!doc) {
    return (
      <div className="dashboard">
        <h2>لا يوجد مشروع مفتوح</h2>
        <button className="btn primary" onClick={() => goto("dashboard")}>← {t("back")}</button>
      </div>
    );
  }

  return (
    <>
      <div className="editor-topbar">
        <button className="btn small" onClick={() => { saveProject(doc); showToast(t("autosaved")); goto("storyboard"); }}>← للوحة المشاهد</button>
        <input
          type="text"
          value={doc.name}
          aria-label="اسم المشروع"
          onChange={(e) => {
            const value = e.target.value;
            updateDoc((draft) => { draft.name = value || draft.name; });
          }}
          style={{ maxWidth: 260, background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "6px 10px" }}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          {doc.scenes.length} مشاهد — {formatTime(totalDuration(doc))} — حفظ تلقائي ✓
        </span>
        <span style={{ flex: 1 }} />
        <button className={`btn small ${advanced ? "primary" : ""}`} onClick={() => setAdvanced((a) => !a)}>
          {advanced ? "✓ " : "⚙ "}{t("advanced")}
        </button>
        <button className="btn small gold" onClick={() => setExportOpen(true)}>🎬 {t("export")}</button>
      </div>

      <div className="editor">
        <div className="left-panel">
          <LibraryPanel />
        </div>
        <div className="center-panel">
          <div className="panel-title" style={{ marginBottom: 0 }}>{t("preview")}</div>
          <PreviewPlayer />
        </div>
        <div className="right-panel">
          <div className="panel-title">{t("properties")}</div>
          <PropertiesPanel advanced={advanced} />
        </div>
        <div className="timeline-panel">
          <Timeline />
        </div>
      </div>

      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </>
  );
}
