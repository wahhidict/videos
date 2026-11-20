// لوحة المشاهد — شاشة منظّمة: رقم، عنوان، نص العرض، معاينة بصرية، المدة، حالة الصوت،
// تعديل مستقل + إعادة توليد مشهد واحد أو السيناريو كاملاً.

import { useState } from "react";
import type { ProjectDoc } from "@msaipro/core";
import {
  uid,
  deleteScene,
  duplicateScene,
  formatDurationAr,
  formatTime,
  planStoryboard,
  regenerateScenePlan,
  totalDuration,
  buildSceneFromPlan,
  PALETTES,
} from "@msaipro/core";
import { useApp } from "../store/appState";
import { SceneThumb } from "../components/SceneThumb";
import { SceneAssetPanel } from "../components/SceneAssetPanel";
import { assetQueryForScene } from "@msaipro/core";
import type { CandidateAsset } from "../assets/assetSearch";
import {
  applyVoiceover,
  generateVoiceover,
  piperAvailable,
  desktopExt,
  resyncVoiceTracks,
} from "../voice/voiceover";

export function Storyboard() {
  const { doc, updateDoc, goto, setSceneIndex, setPlayhead, t, showToast, ai } = useApp();
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [assetsOpen, setAssetsOpen] = useState<number | null>(null);

  if (!doc || !doc.scenes.length) {
    return (
      <div className="storyboard" style={{ padding: 40 }}>
        <h2>لا توجد مشاهد بعد</h2>
        <p className="muted">ابدأ بإنشاء فيديو جديد من الشاشة الرئيسية.</p>
        <button className="btn primary" onClick={() => goto("dashboard")}>← {t("back")}</button>
      </div>
    );
  }

  const vertical = doc.canvas.height > doc.canvas.width;
  const palette = PALETTES[doc.meta?.style ?? "professional"];
  const idea = doc.meta?.idea;
  const type = doc.meta?.type;
  const canRegen = Boolean(idea && type);
  const voiceTracksByScene = new Map(
    doc.audio.filter((tr) => tr.role === "voice" && tr.sceneId).map((tr) => [tr.sceneId as string, tr]),
  );
  const missingVoice = doc.voice.mode === "piper" && doc.scenes.some((s) => !voiceTracksByScene.has(s.id));

  const openEditorAt = (i: number) => {
    setSceneIndex(i);
    setPlayhead(doc.scenes.slice(0, i).reduce((a, s) => a + s.duration, 0) + 0.05);
    goto("editor");
  };

  const patchScene = (i: number, patch: { title?: string; script?: string; duration?: number }) => {
    updateDoc((draft) => {
      const scn = draft.scenes[i];
      if ("duration" in patch && patch.duration != null) {
        scn.duration = Math.max(0.5, Math.min(600, patch.duration));
      } else {
        Object.assign(scn, patch);
      }
      resyncVoiceTracks(draft);
    });
  };

  const genVoices = async (
    scenes: { id: string; voiceScript: string; plannedDuration?: number }[],
  ) => {
    if (!(await piperAvailable())) return null;
    return generateVoiceover(scenes, {
      model: ai.piperModel,
      onProgress: (done, total) => showToast(`${done}/${total}`),
    });
  };

  const regenScene = async (i: number) => {
    if (!canRegen || busy !== null) return;
    setBusy(i);
    try {
      const scenePlan = regenerateScenePlan(idea as string, type as never, i, doc.scenes.length, Math.floor(Math.random() * 997));
      if (!scenePlan) { showToast(t("voiceGenFailed")); return; }
      const fresh = buildSceneFromPlan(scenePlan, i, palette, vertical);
      fresh.id = doc.scenes[i].id;
      fresh.duration = doc.scenes[i].duration;
      let gen = null;
      if (doc.voice.mode === "piper" && desktopExt()?.piperSpeak) {
        gen = (await genVoices([{ id: fresh.id, voiceScript: scenePlan.voiceover, plannedDuration: fresh.duration }])) ?? null;
      }
      updateDoc((draft) => {
        draft.scenes[i] = fresh;
        if (gen && gen.ok) applyVoiceover(draft, gen, "matched");
        resyncVoiceTracks(draft);
      });
      showToast(gen && !gen.ok ? t("voiceGenFailed") : t("voiceRegenDone"));
    } finally {
      setBusy(null);
    }
  };

  const regenAll = async () => {
    if (!canRegen || busy !== null) return;
    setBusy("all");
    try {
      const plan = planStoryboard(idea as string, type as never, Math.round(totalDuration(doc)));
      const paletteAll = palette;
      const fresh = plan.scenes.map((sp, i) => buildSceneFromPlan(sp, i, paletteAll, vertical));
      const gen = doc.voice.mode === "piper" && desktopExt()?.piperSpeak
        ? (await genVoices(fresh.map((s, i) => ({ id: s.id, voiceScript: s.voiceScript, plannedDuration: plan.scenes[i]?.duration })))) ?? null
        : null;
      updateDoc((draft) => {
        draft.scenes = fresh;
        if (draft.meta) draft.meta = { ...draft.meta, plan: plan.scenes };
        if (gen && gen.ok) applyVoiceover(draft, gen, "all");
        resyncVoiceTracks(draft);
      });
      showToast(gen && !gen.ok ? t("voiceGenFailed") : t("voiceRegenDone"));
    } finally {
      setBusy(null);
    }
  };

  const genSceneVoice = async (i: number) => {
    if (busy !== null) return;
    setBusy(i);
    try {
      const scn = doc.scenes[i];
      const gen = (await genVoices([{ id: scn.id, voiceScript: scn.voiceScript, plannedDuration: scn.duration }])) ?? null;
      if (!gen) { showToast(t("voiceGenMissing")); return; }
      updateDoc((draft) => {
        if (gen.ok) applyVoiceover(draft, gen, "matched");
        resyncVoiceTracks(draft);
      });
      showToast(gen.ok ? t("voiceRegenDone") : t("voiceGenFailed"));
    } finally {
      setBusy(null);
    }
  };

  const sceneAssetQueries = (i: number): string[] => {
    const planRow = doc.meta?.plan?.[i];
    const scn = doc.scenes[i];
    const brief = assetQueryForScene({
      visualIdea: planRow?.visual ?? "",
      onScreen: planRow?.onScreen ?? scn.title,
      voiceover: scn.voiceScript,
    });
    return brief.queries.length ? brief.queries : [brief.query];
  };

  return (
    <div className="storyboard">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>{t("storyboard")}</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            {doc.scenes.length} مشهد — المدة الكلية {formatDurationAr(totalDuration(doc))} ({formatTime(totalDuration(doc))})
          </p>
        </div>
        <div className="row">
          <button className="btn" disabled={busy !== null || !canRegen} onClick={() => void regenAll()}>
            ↻ {t("regenAll")}
          </button>
          <button className="btn gold" onClick={() => openEditorAt(0)}>🗓 {t("openEditor")}</button>
        </div>
      </div>

      {missingVoice && (
        <div className="row" style={{ margin: "14px 24px 0", padding: "10px 14px", border: "1px solid var(--accent, #e8b84b)", borderRadius: 10, gap: 10, flexWrap: "wrap" }}>
          <span>🎙 {t("voiceGenMissing")}</span>
          <button className="btn small primary" disabled={busy !== null} onClick={() => {
            void (async () => {
              setBusy("all");
              try {
                const gen = (await genVoices(doc.scenes.map((s) => ({ id: s.id, voiceScript: s.voiceScript })))) ?? null;
                if (!gen) { showToast(t("voiceGenMissing")); return; }
                updateDoc((draft) => {
                  if (gen.ok) applyVoiceover(draft, gen, "all");
                });
                showToast(gen.ok ? t("voiceGenDone").replace("@n", String(gen.generated)) : t("voiceGenFailed"));
              } finally { setBusy(null); }
            })();
          }}>🎙 {t("regenAll")}</button>
        </div>
      )}

      <div className="sb-grid">
        {doc.scenes.map((scn, i) => {
          const voice = voiceTracksByScene.get(scn.id);
          const visual = doc.meta?.plan?.[i]?.visual;
          return (
            <div key={scn.id} className="sb-card" onClick={() => openEditorAt(i)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") openEditorAt(i); }}>
              <SceneThumb doc={doc} sceneIndex={i} width={260} />
              <div className="sb-info">
                <div className="sb-title" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 10px", fontSize: 12 }}>
                    مشهد {i + 1}
                  </span>
                  <b>{scn.title}</b>
                </div>
                <textarea
                  className="sb-script-edit"
                  value={scn.script}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => patchScene(i, { script: e.target.value })}
                  style={{ width: "100%", minHeight: 56, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: 8, fontFamily: "inherit", fontSize: 13, resize: "vertical" }}
                  aria-label={`نص المشهد ${i + 1}`}
                />
                {visual && (
                  <p className="muted" style={{ fontSize: 11, margin: "6px 0 0", opacity: 0.75 }}>
                    {t("sceneVisual")}: {visual}
                  </p>
                )}
                <div className="row" style={{ marginTop: 8, alignItems: "center", flexWrap: "wrap", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <span
                    className="muted"
                    style={{
                      fontSize: 12,
                      background: voice ? "rgba(80,200,120,0.14)" : "rgba(255,180,80,0.12)",
                      border: "1px solid",
                      borderColor: voice ? "rgba(80,200,120,0.5)" : "rgba(255,180,80,0.45)",
                      borderRadius: 999,
                      padding: "3px 10px",
                    }}
                    title={voice ? `startAt=${voice.startAt}s (sceneStart)` : undefined}
                  >
                    {voice ? `🔊 ${t("storyAudioDur").replace("@n", String(Math.round((voice.outPoint ?? 0) * 10) / 10))}` : `🔇 ${t("storyNoAudio")}`}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    ⏱ {formatDurationAr(scn.duration)} ({formatTime(scn.duration)})
                  </span>
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
                </div>
                <div className="row" style={{ marginTop: 8, flexWrap: "wrap", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button className="btn small" disabled={busy !== null} onClick={() => void regenScene(i)}>
                    ↻ {t("regenScene")}
                  </button>
                  {doc.voice.mode === "piper" && (
                    <button className="btn small" disabled={busy !== null} onClick={() => void genSceneVoice(i)}>
                      🎙 {t("voiceGenScene")}
                    </button>
                  )}
                  <button className="btn small" onClick={() => { updateDoc((draft) => duplicateScene(draft, i)); showToast(t("duplicateScene")); }}>{t("duplicateScene")}</button>
                  <button
                    className="btn small danger"
                    disabled={doc.scenes.length <= 1}
                    onClick={() => { updateDoc((draft) => deleteScene(draft, i)); showToast(t("deleteScene")); }}
                  >🗑</button>
                  <button className="btn small" onClick={() => setAssetsOpen(assetsOpen === i ? null : i)}>🖼 صور مرخّصة</button>
                </div>
                {assetsOpen === i && (
                  <SceneAssetPanel
                    queries={sceneAssetQueries(i)}
                    onPick={(dataUrl: string, asset: CandidateAsset) => {
                      updateDoc((draft) => {
                        const scn = draft.scenes[i];
                        const hasImage = scn.layers.some((l) => l.kind === "image");
                        const layer = {
                          id: uid("lay"),
                          name: (asset.title || "صورة مرخّصة").slice(0, 30),
                          kind: "image" as const,
                          x: 0.5,
                          y: 0.42,
                          w: 0.5,
                          opacity: 1,
                          startAt: 0,
                          anim: "fadeIn" as const,
                          animDuration: 0.8,
                          animDelay: 0,
                          rot: 0,
                          src: dataUrl,
                          fit: "cover" as const,
                          radius: 18,
                        };
                        if (hasImage) {
                          const idx = scn.layers.map((l) => l.kind === "image").indexOf(true);
                          scn.layers[idx] = { ...layer, id: scn.layers[idx].id };
                        } else {
                          scn.layers.push(layer);
                        }
                      });
                      setAssetsOpen(null);
                    }}
                    showToast={showToast}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
