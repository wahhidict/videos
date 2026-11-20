import { useState } from "react";
import type { ChartLayer, ImageLayer, Keyframe, Layer, MotionPresetId, ShapeLayer, TextLayer } from "@msaipro/core";
import {
  BACKGROUND_STYLES,
  MOTION_PRESETS,
  TRANSITIONS,
  uid,
  type Scene,
} from "@msaipro/core";
import { useApp, cloneLayer } from "../store/appState";
import { textLayer, accentShape, counterChart } from "@msaipro/core";
import { PALETTES } from "@msaipro/core";
import { buildScene } from "@msaipro/core";

export function PropertiesPanel({ advanced }: { advanced: boolean }) {
  const { doc, updateDoc, sceneIndex, selectedLayerId, setSelectedLayerId } = useApp();
  if (!doc) return null;
  const scene = doc.scenes[sceneIndex];
  if (!scene) return <p className="muted">لا توجد مشاهد بعد</p>;
  const layer = scene.layers.find((l) => l.id === selectedLayerId) ?? null;

  const patchLayer = (patch: Record<string, unknown>) => {
    updateDoc((draft) => {
      const target = draft.scenes[sceneIndex]?.layers.find((l) => l.id === selectedLayerId);
      if (!target) return;
      Object.assign(target as unknown as Record<string, unknown>, patch);
    });
  };

  const patchScene = (patch: Partial<Scene>) => {
    updateDoc((draft) => {
      const target = draft.scenes[sceneIndex];
      if (!target) return;
      Object.assign(target, patch);
    });
  };

  return (
    <div>
      <div className="panel-title">خصائص العنصر</div>

      {!layer && (
        <>
          <SceneProps scene={scene} patchScene={patchScene} onAddScene={undefined} />
          <div className="divider" />
          <div className="prop-row">
            <label>النص الرئيسي في المشهد</label>
            <textarea
              value={scene.layers.find((l) => l.kind === "text")?.kind === "text" ? (scene.layers.find((l) => l.kind === "text") as TextLayer).text : scene.script}
              onChange={(e) => {
                const text = e.target.value;
                updateDoc((draft) => {
                  const target = draft.scenes[sceneIndex];
                  if (!target) return;
                  target.script = text;
                  target.voiceScript = text;
                  const textLayer0 = target.layers.find((l) => l.kind === "text") as TextLayer | undefined;
                  if (textLayer0) textLayer0.text = text.length > 110 ? text.slice(0, 110) + "…" : text;
                });
              }}
            />
            <small className="muted">تعديل النص يستبدل نص المشهد — لتنسيق أدق اختر عنصر النص من القائمة</small>
          </div>
          <div className="row">
            <button
              className="btn small"
              onClick={() => {
                updateDoc((draft) => {
                  const target = draft.scenes[sceneIndex];
                  if (!target) return;
                  target.layers.push(
                    textLayer("نص جديد", {
                      palette: PALETTES.professional,
                      y: 0.75,
                      font: { family: "Cairo", size: 56, weight: 700, color: PALETTES.professional.textColor },
                      anim: "fadeIn",
                    } as never),
                  );
                });
              }}
            >
              + إضافة نص
            </button>
            <button
              className="btn small"
              onClick={() =>
                updateDoc((draft) => {
                  const target = draft.scenes[sceneIndex];
                  if (!target) return;
                  target.layers.push(accentShape(PALETTES.professional.accent, target.layers.length));
                })
              }
            >
              + إضافة شكل
            </button>
            <button
              className="btn small"
              onClick={() =>
                updateDoc((draft) => {
                  const target = draft.scenes[sceneIndex];
                  if (!target) return;
                  target.layers.push(
                    counterChart("رسم بياني", [
                      { label: "١", value: 60 },
                      { label: "٢", value: 90 },
                      { label: "٣", value: 40 },
                    ]),
                  );
                })
              }
            >
              + رسم بياني
            </button>
          </div>
        </>
      )}

      {layer && layer.kind === "text" && (
        <TextProps advanced={advanced} layer={layer as TextLayer} patchLayer={patchLayer} patchScene={patchScene} />
      )}
      {layer && layer.kind === "shape" && (
        <ShapeProps advanced={advanced} layer={layer as ShapeLayer} patchLayer={patchLayer} />
      )}
      {layer && layer.kind === "image" && (
        <ImageProps advanced={advanced} layer={layer as ImageLayer} patchLayer={patchLayer} />
      )}
      {layer && layer.kind === "chart" && (
        <ChartProps advanced={advanced} layer={layer as ChartLayer} patchLayer={patchLayer} />
      )}

      {layer && (
        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="btn small"
            onClick={() =>
              updateDoc((draft) => {
                const target = draft.scenes[sceneIndex];
                if (!target) return;
                const idx = target.layers.findIndex((l) => l.id === layer.id);
                const copy = cloneLayer(target.layers[idx]);
                target.layers.splice(idx + 1, 0, copy);
              })
            }
          >
            تكرار
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              updateDoc((draft) => {
                const target = draft.scenes[sceneIndex];
                if (!target) return;
                target.layers = target.layers.filter((l) => l.id !== layer.id);
              });
              setSelectedLayerId(null);
            }}
          >
            حذف العنصر
          </button>
        </div>
      )}
    </div>
  );
}

function MotionFields({
  layer,
  anim,
  animDuration,
  animDelay,
  patchLayer,
  advanced,
}: {
  layer: Layer;
  anim: MotionPresetId;
  animDuration: number;
  animDelay: number;
  patchLayer: (p: Record<string, unknown>) => void;
  advanced: boolean;
}) {
  return (
    <>
      <div className="prop-row">
        <label>الحركة</label>
        <select value={anim} onChange={(e) => patchLayer({ anim: e.target.value as MotionPresetId })}>
          {MOTION_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.nameAr}</option>
          ))}
        </select>
      </div>
      {advanced && (
        <>
          <div className="prop-row">
            <label>مدة الحركة (ثانية)</label>
            <input type="number" min={0.1} max={6} step={0.1} value={animDuration}
              onChange={(e) => patchLayer({ animDuration: Number(e.target.value) })} />
          </div>
          <div className="prop-row">
            <label>تأخير الحركة (ثانية)</label>
            <input type="number" min={0} max={10} step={0.1} value={animDelay}
              onChange={(e) => patchLayer({ animDelay: Number(e.target.value) })} />
          </div>
          <KeyframesFields layer={layer} patchLayer={patchLayer} />
        </>
      )}
    </>
  );
}

const KF_EASE_OPTIONS: { value: string; label: string }[] = [
  { value: "linear", label: "خطي" },
  { value: "easeIn", label: "تسارع" },
  { value: "easeOut", label: "تباطؤ" },
  { value: "easeInOut", label: "ناعم" },
  { value: "easeOutBack", label: "ارتداد خفيف" },
];

function KeyframesFields({ layer, patchLayer }: { layer: Layer; patchLayer: (p: Record<string, unknown>) => void }) {
  const { doc, sceneIndex, playhead, t } = useApp();
  const [open, setOpen] = useState(false);
  if (!doc) return null;
  const scene = doc.scenes[sceneIndex];
  if (!scene) return null;
  const sceneStart = doc.scenes.slice(0, sceneIndex).reduce((a, sc) => a + sc.duration, 0);
  const local = Math.max(0, Math.min(scene.duration, playhead - sceneStart));
  const kfs = layer.keyframes ?? [];

  const setKfs = (next: Keyframe[]) => patchLayer({ keyframes: next });
  const addKeyframe = () => {
    setKfs([...kfs, { t: Math.round(local * 10) / 10, x: layer.x, y: layer.y, scale: 1, rot: layer.rot, opacity: layer.opacity, ease: "easeOut" }].sort((a, b) => a.t - b.t));
  };
  const patchKf = (i: number, patch: Partial<Keyframe>) => {
    setKfs(kfs.map((kf, idx) => (idx === i ? { ...kf, ...patch } : kf)));
  };
  const removeKf = (i: number) => {
    setKfs(kfs.filter((_, idx) => idx !== i));
  };

  const numField = (label: string, value: number, onChange: (v: number) => void, step = 0.05) => (
    <label style={{ fontSize: 11 }}>
      {label}
      <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 64, fontSize: 11 }} />
    </label>
  );

  return (
    <div style={{ border: "1px solid var(--border, #3333)", borderRadius: 10, padding: "8px 10px", marginTop: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <button className="btn small" onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} {t("keyframes")} ({kfs.length})
        </button>
        <button className="btn small primary" onClick={addKeyframe}>+ {t("addKeyAtPlayhead")}</button>
      </div>
      {open && kfs.length === 0 && (
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          لا مفاتيح بعد — حرك رأس التشغيل داخل المشهد ثم أضف مفتاحاً بقيم الطبقة الحالية.
        </p>
      )}
      {open && kfs.map((kf, i) => (
        <div key={i} style={{ borderTop: "1px solid var(--border, #3333)", marginTop: 8, paddingTop: 8 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
            {numField("اللحظة (ث)", kf.t, (v) => patchKf(i, { t: v }), 0.1)}
            {numField("س×", kf.x ?? 0, (v) => patchKf(i, { x: v }))}
            {numField("ص×", kf.y ?? 0, (v) => patchKf(i, { y: v }))}
            {numField("مقياس", kf.scale ?? 1, (v) => patchKf(i, { scale: v }))}
            {numField("دوران", kf.rot ?? 0, (v) => patchKf(i, { rot: v }), 1)}
            {numField("شفافية", kf.opacity ?? 1, (v) => patchKf(i, { opacity: v }))}
            <select value={kf.ease ?? "linear"} onChange={(e) => patchKf(i, { ease: e.target.value })}
              style={{ fontSize: 11 }}>
              {KF_EASE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button className="btn small danger" onClick={() => removeKf(i)}>{t("removeKeyframe")}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TextProps({
  layer,
  patchLayer,
  patchScene,
  advanced,
}: {
  layer: TextLayer;
  patchLayer: (p: Record<string, unknown>) => void;
  patchScene: (s: Partial<Scene>) => void;
  advanced: boolean;
}) {
  return (
    <>
      <div className="prop-row">
        <label>تغيير النص</label>
        <textarea value={layer.text} onChange={(e) => {
          const text = e.target.value;
          patchLayer({ text });
          patchScene({ script: text });
        }} />
      </div>
      <div className="prop-row">
        <label>حجم الخط</label>
        <input type="number" min={10} max={400} value={layer.font.size}
          onChange={(e) => patchLayer({ font: { ...layer.font, size: Number(e.target.value) } })} />
      </div>
      <div className="prop-row">
        <label>تغيير اللون</label>
        <input type="color" value={layer.font.color}
          onChange={(e) => patchLayer({ font: { ...layer.font, color: e.target.value } })} />
      </div>
      <div className="prop-row">
        <label>التنسيق</label>
        <div className="chip-row">
          {(["right", "center", "left"] as const).map((a) => (
            <button key={a} className={`chip ${layer.align === a ? "active" : ""}`}
              onClick={() => patchLayer({ align: a })}>
              {a === "right" ? "يمين" : a === "center" ? "وسط" : "يسار"}
            </button>
          ))}
        </div>
      </div>
      <MotionFields layer={layer} anim={layer.anim} animDuration={layer.animDuration} animDelay={layer.animDelay} patchLayer={patchLayer} advanced={advanced} />
      <div className="prop-row">
        <label>الشفافية ({Math.round(layer.opacity * 100)}%)</label>
        <input type="range" min={0} max={1} step={0.05} value={layer.opacity}
          onChange={(e) => patchLayer({ opacity: Number(e.target.value) })} />
      </div>
      {advanced && (
        <>
          <div className="prop-row">
            <label>الموضع الأفقي ({Math.round(layer.x * 100)}%)</label>
            <input type="range" min={-0.1} max={1} step={0.01} value={layer.x}
              onChange={(e) => patchLayer({ x: Number(e.target.value) })} />
          </div>
          <div className="prop-row">
            <label>الموضع الرأسي ({Math.round(layer.y * 100)}%)</label>
            <input type="range" min={-0.1} max={1} step={0.01} value={layer.y}
              onChange={(e) => patchLayer({ y: Number(e.target.value) })} />
          </div>
          <div className="prop-row">
            <label>العرض ({Math.round(layer.w * 100)}%)</label>
            <input type="range" min={0.05} max={1.2} step={0.01} value={layer.w}
              onChange={(e) => patchLayer({ w: Number(e.target.value) })} />
          </div>
          <div className="prop-row">
            <label>لحظة الظهور في المشهد (ثانية)</label>
            <input type="number" min={0} max={60} step={0.1} value={layer.startAt}
              onChange={(e) => patchLayer({ startAt: Number(e.target.value) })} />
          </div>
        </>
      )}
    </>
  );
}

function ShapeProps({
  layer,
  patchLayer,
  advanced,
}: {
  layer: ShapeLayer;
  patchLayer: (p: Record<string, unknown>) => void;
  advanced: boolean;
}) {
  return (
    <>
      <div className="prop-row">
        <label>نوع الشكل</label>
        <select value={layer.shape} onChange={(e) => patchLayer({ shape: e.target.value })}>
          <option value="rect">مستطيل</option>
          <option value="circle">دائرة</option>
          <option value="triangle">مثلث</option>
          <option value="line">خط</option>
          <option value="bar">شريط</option>
          <option value="ring">إطار دائري</option>
        </select>
      </div>
      <div className="prop-row">
        <label>تغيير اللون</label>
        <input type="color" value={layer.fill} onChange={(e) => patchLayer({ fill: e.target.value })} />
      </div>
      <MotionFields layer={layer} anim={layer.anim} animDuration={layer.animDuration} animDelay={layer.animDelay} patchLayer={patchLayer} advanced={advanced} />
      {advanced && (
        <div className="prop-row">
          <label>العرض ({Math.round(layer.w * 100)}%)</label>
          <input type="range" min={0.02} max={1.2} step={0.01} value={layer.w}
            onChange={(e) => patchLayer({ w: Number(e.target.value) })} />
        </div>
      )}
    </>
  );
}

function ImageProps({
  layer,
  patchLayer,
  advanced,
}: {
  layer: ImageLayer;
  patchLayer: (p: Record<string, unknown>) => void;
  advanced: boolean;
}) {
  return (
    <>
      <div className="prop-row">
        <label>تغيير الصورة</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => patchLayer({ src: String(reader.result) });
            reader.readAsDataURL(file);
          }}
        />
      </div>
      <div className="prop-row">
        <label>الملاءمة</label>
        <div className="chip-row">
          {(["cover", "contain"] as const).map((f) => (
            <button key={f} className={`chip ${layer.fit === f ? "active" : ""}`} onClick={() => patchLayer({ fit: f })}>
              {f === "cover" ? "تغطية" : "احتواء"}
            </button>
          ))}
        </div>
      </div>
      <MotionFields layer={layer} anim={layer.anim} animDuration={layer.animDuration} animDelay={layer.animDelay} patchLayer={patchLayer} advanced={advanced} />
      {advanced && (
        <div className="prop-row">
          <label>العرض ({Math.round(layer.w * 100)}%)</label>
          <input type="range" min={0.05} max={1.2} step={0.01} value={layer.w}
            onChange={(e) => patchLayer({ w: Number(e.target.value) })} />
        </div>
      )}
    </>
  );
}

function ChartProps({
  layer,
  patchLayer,
  advanced,
}: {
  layer: ChartLayer;
  patchLayer: (p: Record<string, unknown>) => void;
  advanced: boolean;
}) {
  return (
    <>
      <div className="prop-row">
        <label>نوع الرسم</label>
        <select value={layer.chart} onChange={(e) => patchLayer({ chart: e.target.value })}>
          <option value="bar">أعمدة</option>
          <option value="line">خط</option>
          <option value="pie">دائري</option>
        </select>
      </div>
      <div className="prop-row">
        <label>العنوان</label>
        <input type="text" value={layer.title ?? ""} onChange={(e) => patchLayer({ title: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>القيم (تُحرَّر كل قيمة على حدة)</label>
        {layer.series.map((s, i) => (
          <div key={i} className="row" style={{ marginBottom: 6 }}>
            <input
              type="text"
              value={s.label}
              style={{ width: "35%" }}
              onChange={(e) => {
                const series = layer.series.map((x, j) => (j === i ? { ...x, label: e.target.value } : x));
                patchLayer({ series });
              }}
            />
            <input
              type="number"
              value={s.value}
              style={{ width: "30%" }}
              onChange={(e) => {
                const series = layer.series.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x));
                patchLayer({ series });
              }}
            />
            <button
              className="btn small danger"
              onClick={() => patchLayer({ series: layer.series.filter((_, j) => j !== i) })}
            >
              حذف
            </button>
          </div>
        ))}
        <button
          className="btn small"
          onClick={() => patchLayer({ series: [...layer.series, { label: "جديد", value: 50 }] })}
        >
          + قيمة جديدة
        </button>
      </div>
      <MotionFields layer={layer} anim={layer.anim} animDuration={layer.animDuration} animDelay={layer.animDelay} patchLayer={patchLayer} advanced={advanced} />
      {advanced && (
        <div className="prop-row">
          <label>العرض ({Math.round(layer.w * 100)}%)</label>
          <input type="range" min={0.1} max={1.2} step={0.01} value={layer.w}
            onChange={(e) => patchLayer({ w: Number(e.target.value) })} />
        </div>
      )}
    </>
  );
}

function SceneProps({
  scene,
  patchScene,
}: {
  scene: Scene;
  patchScene: (s: Partial<Scene>) => void;
  onAddScene?: never;
}) {
  const { updateDoc, sceneIndex, goto } = useApp();
  return (
    <>
      <div className="prop-row">
        <label>عنوان المشهد</label>
        <input type="text" value={scene.title} onChange={(e) => patchScene({ title: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>سكريب التعليق الصوتي لهذا المشهد</label>
        <textarea value={scene.voiceScript} onChange={(e) => patchScene({ voiceScript: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>مدة المشهد (ثانية)</label>
        <input
          type="number"
          min={0.5}
          max={600}
          step={0.5}
          value={scene.duration}
          onChange={(e) =>
            updateDoc((draft) => {
              const target = draft.scenes[sceneIndex];
              if (!target) return;
              target.duration = Math.max(0.5, Number(e.target.value) || 1);
            })
          }
        />
      </div>
      <div className="prop-row">
        <label>الخلفية</label>
        <select value={scene.background.style} onChange={(e) => patchScene({ background: { ...scene.background, style: e.target.value as never } })}>
          {BACKGROUND_STYLES.map((b) => (
            <option key={b.id} value={b.id}>{b.nameAr}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <div className="prop-row" style={{ width: "48%" }}>
          <label>لون الخلفية ١</label>
          <input type="color" value={scene.background.color}
            onChange={(e) => patchScene({ background: { ...scene.background, color: e.target.value } })} />
        </div>
        <div className="prop-row" style={{ width: "48%" }}>
          <label>لون الخلفية ٢</label>
          <input type="color" value={scene.background.color2}
            onChange={(e) => patchScene({ background: { ...scene.background, color2: e.target.value } })} />
        </div>
      </div>
      <div className="prop-row">
        <label>الانتقال من المشهد السابق</label>
        <select
          value={scene.transitionIn}
          onChange={(e) =>
            patchScene({ transitionIn: e.target.value as Scene["transitionIn"], transitionDuration: Math.max(0.3, scene.transitionDuration) })
          }
        >
          {TRANSITIONS.map((tr) => (
            <option key={tr.id} value={tr.id}>{tr.nameAr}</option>
          ))}
        </select>
      </div>
      <div className="prop-row">
        <label>حركة الكاميرا — تكبير ({scene.camera.zoom.toFixed(2)}×)</label>
        <input
          type="range"
          min={1}
          max={1.5}
          step={0.01}
          value={scene.camera.zoom}
          onChange={(e) => patchScene({ camera: { ...scene.camera, zoom: Number(e.target.value) } })}
        />
      </div>
      <div className="row">
        <div className="prop-row" style={{ width: "48%" }}>
          <label>تحريك أفقي ({Math.round(scene.camera.panX * 100)}%)</label>
          <input type="range" min={-1} max={1} step={0.05} value={scene.camera.panX}
            onChange={(e) => patchScene({ camera: { ...scene.camera, panX: Number(e.target.value) } })} />
        </div>
        <div className="prop-row" style={{ width: "48%" }}>
          <label>تحريك رأسي ({Math.round(scene.camera.panY * 100)}%)</label>
          <input type="range" min={-1} max={1} step={0.05} value={scene.camera.panY}
            onChange={(e) => patchScene({ camera: { ...scene.camera, panY: Number(e.target.value) } })} />
        </div>
      </div>
      <div className="row">
        <button
          className="btn small"
          onClick={() =>
            updateDoc((draft) => {
              const name = `مشهد ${draft.scenes.length + 1}`;
              const vertical = draft.canvas.height > draft.canvas.width;
              const palette = PALETTES.professional;
              const s = buildScene(name, draft.scenes.length, palette, vertical);
              s.id = uid("scn");
              s.script = "نص المشهد الجديد";
              draft.scenes.push(s);
            })
          }
        >
          + إضافة مشهد
        </button>
        <button className="btn small" onClick={() => goto("dashboard")}>حفظ والعودة</button>
      </div>
    </>
  );
}
