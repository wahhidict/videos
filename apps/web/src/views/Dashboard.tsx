// لوحة البداية — ستة إجراءات فقط، بدون أي إعدادات تقنية.

import { useState } from "react";
import type { VideoTypeId } from "@msaipro/core";
import { TEMPLATES, instantiateTemplate } from "@msaipro/core";
import { useApp } from "../store/appState";
import { setWizardInit } from "../store/wizardInit";
import { Modal } from "../components/Modal";

export function Dashboard() {
  const { goto, newBlankProject, setDoc, t, projects, refreshProjects } = useApp();
  const [gallery, setGallery] = useState(false);

  const startWizard = (mode: "idea" | "text", presetType: VideoTypeId | null, name: string) => {
    refreshProjects();
    setWizardInit({ presetType, templateId: null, mode, name });
    newBlankProject(name);
  };

  const openTemplate = (id: string) => {
    const fresh = instantiateTemplate(id);
    if (!fresh) return;
    setWizardInit({ presetType: null, templateId: id, mode: "idea", name: fresh.name });
    setDoc(fresh);
    goto("storyboard");
  };

  const tiles: { icon: string; title: string; desc: string; onClick: () => void }[] = [
    { icon: "🎬", title: t("newVideo"), desc: "معالج خطوة بخطوة يحوّل فكرتك إلى فيديو كامل مشاهد ومؤثرات وحركة", onClick: () => startWizard("idea", null, "فيديو جديد") },
    { icon: "📝", title: t("textToVideo"), desc: "الصق نصك المكتوب وسنقسّمه مشاهد مرئية متتابعة تلقائياً", onClick: () => startWizard("text", null, "من النص") },
    { icon: "🎓", title: t("educationalVideo"), desc: "شرح مبسّط بمخططات ورسوم تُبنى تلقائياً لأي موضوع تعليمي", onClick: () => startWizard("idea", "educational", "درس تعليمي") },
    { icon: "📣", title: t("adVideo"), desc: "إعلان قصير مؤثر يتضمن الخطاف والمزايا والدعوة لاتخاذ إجراء", onClick: () => startWizard("idea", "ad", "إعلان") },
    { icon: "🎨", title: t("useTemplate"), desc: "أكثر من 9 قوالب جاهزة لكل المنصات — قابلة للتعديل بالكامل", onClick: () => setGallery(true) },
    { icon: "🗂", title: t("myProjects"), desc: projects.length ? `${projects.length} مشروع محفوظ محلياً في جهازك` : "ستظهر مشاريعك المحفوظة هنا على جهازك", onClick: () => { refreshProjects(); goto("projects"); } },
  ];

  return (
    <div className="dashboard">
      <div className="hero">
        <h1>🎬 {t("appName")}</h1>
        <p>{t("appTagline")}</p>
      </div>
      <div className="tiles">
        {tiles.map((tile) => (
          <div key={tile.title} className="tile" role="button" tabIndex={0} onClick={tile.onClick}
            onKeyDown={(e) => { if (e.key === "Enter") tile.onClick(); }}>
            <div className="icon">{tile.icon}</div>
            <h3>{tile.title}</h3>
            <p>{tile.desc}</p>
          </div>
        ))}
      </div>

      {gallery && (
        <Modal title={t("useTemplate")} onClose={() => setGallery(false)} wide>
          <div className="gallery-grid">
            {TEMPLATES.map((tpl) => (
              <div key={tpl.id} className="template-card" onClick={() => { setGallery(false); openTemplate(tpl.id); }}>
                <h4>{tpl.nameAr}</h4>
                <p>{tpl.descAr}</p>
                <span className="badge ok" style={{ display: "inline-block", marginTop: 8 }}>
                  {categoryAr(tpl.category)}
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function categoryAr(id: string): string {
  const map: Record<string, string> = {
    youtube: "يوتيوب",
    reels: "ريلز / تيك توك",
    edu: "تعليمي",
    finance: "محتوى مالي",
    trading: "تداول",
    ad: "إعلان",
    documentary: "وثائقي",
    story: "قصصي",
    infographic: "إنفوغرافيك",
  };
  return map[id] ?? id;
}
