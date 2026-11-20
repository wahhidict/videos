// مشاريعي — فتح، تكرار، حذف، استيراد JSON، تصدير JSON (ملف مشروع محمول).

import { useRef } from "react";
import { newDoc, parseProject, serializeProject } from "@msaipro/core";
import { useApp } from "../store/appState";
import { loadProject, removeProject, saveProject } from "../store/storage";
import { saveBlobAsFile } from "../export/desktop";

export function ProjectsView() {
  const { projects, refreshProjects, openProject, deleteProject, setDoc, goto, t, showToast } = useApp();
  const importRef = useRef<HTMLInputElement | null>(null);

  const duplicate = (id: string) => {
    const doc = loadProject(id);
    if (!doc) return;
    const copy = structuredClone(doc);
    copy.id = newDoc().id;
    copy.name = `${doc.name} — نسخة`;
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    saveProject(copy);
    refreshProjects();
    showToast(t("duplicateProject"));
  };

  const exportJson = (id: string) => {
    const doc = loadProject(id);
    if (!doc) return;
    saveBlobAsFile(`${doc.name}.mstudio.json`, new Blob([serializeProject(doc)], { type: "application/json" }));
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const { doc, errorAr } = parseProject(text);
      if (!doc) { showToast(errorAr ?? t("error")); return; }
      saveProject(doc);
      refreshProjects();
      setDoc(doc);
      goto("editor");
      showToast(`تم استيراد: ${doc.name}`);
    } catch {
      showToast("ملف غير صالح");
    }
  };

  return (
    <div className="dashboard">
      <h2 style={{ textAlign: "center", marginBottom: 6 }}>🗂 {t("myProjects")}</h2>
      <p className="muted" style={{ textAlign: "center" }}>
        كل المشروعات محفوظة على جهازك تلقائياً — بلا حساب ولا إنترنت.
      </p>
      <div className="row" style={{ justifyContent: "center", margin: "16px 0 24px" }}>
        <button className="btn primary" onClick={() => goto("dashboard")}>+ {t("newVideo")}</button>
        <button className="btn" onClick={() => importRef.current?.click()}>⤴ {t("importProject")}</button>
        <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={(e) => void importJson(e.target.files?.[0])} />
      </div>

      {projects.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", fontSize: 16 }}>{t("noProjects")}</p>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <div key={p.id} className="project-card">
              <h4>{p.name}</h4>
              <div className="meta">
                {p.sceneCount} مشاهد — {p.durationSec.toFixed(0)}ث
                <br />
                {t("lastSaved")}: {new Date(p.updatedAt).toLocaleString("ar")}
              </div>
              <div className="actions">
                <button className="btn small primary" onClick={() => { if (!openProject(p.id)) showToast("تعذر فتح المشروع"); }}>{t("openProject")}</button>
                <button className="btn small" onClick={() => duplicate(p.id)}>{t("duplicate")}</button>
                <button className="btn small" onClick={() => exportJson(p.id)}>⤓ تصدير JSON</button>
                <button className="btn small danger" onClick={() => { deleteProject(p.id); showToast(t("delete")); }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
