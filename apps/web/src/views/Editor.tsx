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
  const { doc, goto, updateDoc, t, showToast, canUndo, canRedo, undo, redo, runNaturalCommand, confirmNaturalCommand } = useApp();
  const [exportOpen, setExportOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [commandText, setCommandText] = useState("");

  const submitCommand = () => {
    const text = commandText.trim();
    if (!text) return;
    const cmd = runNaturalCommand(text);
    if (!cmd.ok) {
      showToast(cmd.summary);
      return;
    }
    if (cmd.destructive) {
      if (window.confirm(`${cmd.summary} \u2014 ${t("confirm")}؟`)) {
        confirmNaturalCommand(cmd);
        showToast(t("commandConfirmed"));
        setCommandText("");
      }
      return;
    }
    showToast(cmd.summary);
    setCommandText("");
  };

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
        <button className="btn small" onClick={undo} disabled={!canUndo} aria-label={t("undo")}>
          ↺ {t("undo")}
        </button>
        <button className="btn small" onClick={redo} disabled={!canRedo} aria-label={t("redo")}>
          ↻ {t("redo")}
        </button>
        <input
          type="text"
          value={commandText}
          placeholder={t("commandPlaceholder")}
          aria-label={t("commandPlaceholder")}
          onChange={(e) => setCommandText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitCommand();
          }}
          style={{ width: 280, background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "6px 10px" }}
        />
        <button className="btn small" onClick={submitCommand} disabled={!commandText.trim()}>
          {t("commandRun")}
        </button>
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
