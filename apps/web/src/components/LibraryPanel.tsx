// اللوحة اليسرى في المحرر: المشاهد، القوالب، الصور، النصوص، الصوت، الترجمة.

import { useRef, useState } from "react";
import type { ImageLayer } from "@msaipro/core";
import {
  TEMPLATES,
  duplicateScene,
  deleteScene,
  instantiateTemplate,
  textLayer,
  buildScene,
  PALETTES,
  sceneTimings,
} from "@msaipro/core";
import { useApp, cloneLayer } from "../store/appState";
import { SceneThumb } from "./SceneThumb";
import { Modal } from "./Modal";
import { AudioStudio } from "./AudioStudio";
import { SubtitlePanel } from "./SubtitlePanel";
import { saveProject } from "../store/storage";

type Tab = "scenes" | "templates" | "images" | "texts" | "audio" | "subs";

async function fileToScaledDataUrl(file: File, maxSide = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function LibraryPanel() {
  const {
    doc, updateDoc, setDoc, sceneIndex, setSceneIndex, setSelectedLayerId, selectedLayerId,
    playhead, setPlayhead, showToast, t, setPlaying,
  } = useApp();
  const [tab, setTab] = useState<Tab>("scenes");
  const [gallery, setGallery] = useState(false);
  const imgRef = useRef<HTMLInputElement | null>(null);
  if (!doc) return null;

  const scene = doc.scenes[sceneIndex];
  const timings = sceneTimings(doc);

  const selectScene = (i: number) => {
    setSceneIndex(i);
    setSelectedLayerId(null);
    setPlayhead(timings[i].start + 0.05);
  };

  const addBlankText = () => {
    const layer = textLayer(t("addTextPrompt"), {
      palette: PALETTES.professional,
      y: 0.5,
      font: { family: "Cairo", size: 64, weight: 700, color: PALETTES.professional.textColor },
      anim: "fadeInUp",
      animDuration: 0.7,
      align: "center",
    });
    layer.startAt = Math.max(0, Math.min(playhead - timings[sceneIndex].start, scene.duration - 0.5));
    updateDoc((draft) => { draft.scenes[sceneIndex].layers.push(layer); });
    setSelectedLayerId(layer.id);
    setTab("texts");
  };

  const onImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: ImageLayer[] = [];
    for (const file of Array.from(files).slice(0, 8)) {
      try {
        const src = await fileToScaledDataUrl(file);
        added.push({
          id: `lay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          name: file.name.slice(0, 30),
          kind: "image",
          x: 0.5,
          y: 0.5,
          w: 0.55,
          opacity: 1,
          startAt: 0,
          anim: "fadeIn",
          animDuration: 0.8,
          animDelay: 0,
          rot: 0,
          src,
          fit: "cover",
          radius: 18,
        });
      } catch {
        showToast("تعذر قراءة الصورة");
      }
    }
    if (added.length) {
      updateDoc((draft) => {
        for (const layer of added) draft.scenes[sceneIndex].layers.push(layer);
      });
      setSelectedLayerId(added[0].id);
      showToast(`تمت إضافة ${added.length} صورة إلى المشهد`);
    }
  };

  const applyTemplate = (id: string) => {
    const fresh = instantiateTemplate(id, doc.name);
    if (!fresh) return;
    fresh.id = doc.id;
    fresh.name = doc.name;
    fresh.createdAt = doc.createdAt;
    setDoc(fresh);
    setGallery(false);
    showToast("تم تطبيق القالب — يمكنك تعديله بالكامل");
  };

  const saveNow = () => {
    setPlaying(false);
    saveProject(doc);
    showToast(t("autosaved"));
  };

  return (
    <div>
      <div className="sidebar-tabs">
        {([["scenes", t("scenes")], ["templates", t("templates")], ["images", t("images")], ["texts", t("texts")], ["audio", t("audio")], ["subs", t("subtitles")]] as const).map(([key, label]) => (
          <button key={key} className={`sidebar-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "scenes" && (
        <>
          <div className="chip-row" style={{ marginBottom: 10 }}>
            <button
              className="btn small primary"
              onClick={() => updateDoc((draft) => {
                const fresh = buildScene("مشهد جديد", sceneIndex + 1, PALETTES.professional, draft.canvas.height > draft.canvas.width);
                fresh.duration = 5;
                draft.scenes.splice(sceneIndex + 1, 0, fresh);
              })}
            >+ {t("addScene")}</button>
            <button className="btn small" onClick={() => { updateDoc((draft) => duplicateScene(draft, sceneIndex)); showToast(t("duplicateScene")); }}>{t("duplicateScene")}</button>
            <button
              className="btn small danger"
              disabled={doc.scenes.length <= 1}
              onClick={() => { updateDoc((draft) => deleteScene(draft, sceneIndex)); setSceneIndex(Math.max(0, sceneIndex - 1)); showToast(t("deleteScene")); }}
            >🗑 {t("deleteScene")}</button>
          </div>
          <div className="scene-list">
            {doc.scenes.map((scn, i) => (
              <div key={scn.id} className={`scene-item ${i === sceneIndex ? "selected" : ""}`} onClick={() => selectScene(i)}>
                <SceneThumb doc={doc} sceneIndex={i} width={86} />
                <div className="meta">
                  <div className="t">مشهد {i + 1} — {scn.title}</div>
                  <div className="d">{scn.duration.toFixed(1)} {t("seconds")}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="btn gold" style={{ width: "100%", marginTop: 12 }} onClick={saveNow}>💾 {t("save")}</button>
        </>
      )}

      {tab === "templates" && (
        <>
          <p className="muted">قوالب جاهزة قابلة للتعديل بالكامل — تعمل بدون إنترنت وبدون ذكاء اصطناعي.</p>
          <button className="btn primary" style={{ width: "100%" }} onClick={() => setGallery(true)}>🎨 {t("useTemplate")}</button>
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            سيتم استبدال مشاهد المشروع الحالي بمشاهد القالب المختار ثم يمكنك تعديل النصوص والألوان بحرية.
          </p>
        </>
      )}

      {tab === "images" && (
        <>
          <p className="muted">ارفع صوراً من جهازك لإضافتها إلى المشهد الحالي. تُضغط الصور تلقائياً للحفاظ على سرعة التطبيق.</p>
          <div className="upload-zone" onClick={() => imgRef.current?.click()}>🖼 {t("addItemImage")}</div>
          <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onImages(e.target.files)} />
          <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            {scene ? `${scene.layers.filter((l) => l.kind === "image").length} صورة في هذا المشهد` : ""}
          </p>
        </>
      )}

      {tab === "texts" && (
        <>
          <p className="muted">أضف عناصر جديدة إلى المشهد الحالي (مشهد {sceneIndex + 1}).</p>
          <div className="chip-row">
            <button className="btn primary" onClick={addBlankText}>{t("addItemText")}</button>
            <button
              className="btn"
              onClick={() => updateDoc((draft) => {
                draft.scenes[sceneIndex].layers.push({
                  id: `shp_${Date.now().toString(36)}`,
                  kind: "shape",
                  name: "شكل",
                  x: 0.5,
                  y: 0.7,
                  w: 0.25,
                  opacity: 1,
                  startAt: 0,
                  anim: "popIn",
                  animDuration: 0.7,
                  animDelay: 0,
                  rot: 0,
                  shape: "rect",
                  fill: "#5b8cff",
                  stroke: null,
                  strokeWidth: 0,
                  radius: 16,
                });
                setSelectedLayerId(null);
              })}
            >{t("addItemShape")}</button>
            <button role={undefined} className="btn" onClick={() => updateDoc((draft) => {
              draft.scenes[sceneIndex].layers.push({
                id: `cht_${Date.now().toString(36)}`,
                kind: "chart",
                name: "رسم بياني",
                x: 0.5,
                y: 0.55,
                w: 0.5,
                opacity: 1,
                startAt: 0,
                anim: "fadeInUp",
                animDuration: 1,
                animDelay: 0,
                rot: 0,
                chart: "bar",
                series: [
                  { label: "أ", value: 40 },
                  { label: "ب", value: 65 },
                  { label: "ج", value: 85 },
                ],
                colors: ["#6c8cff", "#ffb74a", "#4dd6a0"],
                title: null,
              });
            })}>{t("addItemChart")}</button>
          </div>
          {scene && scene.layers.length > 0 && (
            <>
              <div className="section-title">طبقات المشهد الحالي</div>
              <div className="layer-list">
                {scene.layers.map((layer) => (
                  <div
                    key={layer.id}
                    className={`layer-item ${layer.id === selectedLayerId ? "selected" : ""}`}
                    onClick={() => setSelectedLayerId(layer.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") setSelectedLayerId(layer.id); }}
                  >
                    <span>{layerKindIcon(layer.kind)}</span> {layer.name}
                    {layer.id === selectedLayerId && <span className="muted"> ← الخصائص على اليمين</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "audio" && <AudioStudio />}
      {tab === "subs" && <SubtitlePanel />}

      {gallery && (
        <Modal title={t("templates")} onClose={() => setGallery(false)} wide>
          <div className="gallery-grid">
            {TEMPLATES.map((tpl) => (
              <div key={tpl.id} className="template-card" onClick={() => applyTemplate(tpl.id)}>
                <h4>{tpl.nameAr}</h4>
                <p>{tpl.descAr}</p>
                <span className="badge ok" style={{ display: "inline-block", marginTop: 8 }}>{tpl.category}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function layerKindIcon(kind: string): string {
  return kind === "text" ? "🔤" : kind === "image" ? "🖼" : kind === "chart" ? "📊" : "◼";
}

