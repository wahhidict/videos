import type {
  BackgroundStyleId,
  Layer,
  MotionPresetId,
  Scene,
  SceneTransitionId,
} from "./types";
import { evalCameraKeyframes, evalKeyframes } from "./keyframes";
import {
  easeOutBack,
  easeOutBounce,
  easeOutCubic,
  easeOutQuad,
  linear,
  progressAt,
} from "./easing";

export interface LayerTransform {
  alpha: number;
  scale: number;
  rot: number;
  clipX: number; // 0..1 wipe reveal, 1 = fully visible
  offsetX: number; // px, already scaled to canvas
  offsetY: number;
  blur: number; // px
  /** موضع فعّال من مفاتيح (نسبة 0..1) — يُستخدم بدل layer.x/y عند وجوده. */
  effX?: number;
  effY?: number;
  /** دوران مطلق من مفاتيح — يُستخدم بدل layer.rot + tf.rot عند وجوده. */
  absRot?: number;
}

export interface MotionPresetDef {
  id: MotionPresetId;
  nameAr: string;
  isLoop: boolean;
  apply(layer: Layer, tLocal: number, canvasW: number, canvasH: number): Partial<LayerTransform>;
}

function enter(layer: Layer, tLocal: number): number {
  return easeOutCubic(progressAt(tLocal, layer.animDelay, Math.max(0.05, layer.animDuration)));
}

const id = (n: number) => n;

export const MOTION_PRESETS: MotionPresetDef[] = [
  {
    id: "none",
    nameAr: "بدون حركة",
    isLoop: false,
    apply: () => ({}),
  },
  {
    id: "fadeIn",
    nameAr: "ظهور تدريجي",
    isLoop: false,
    apply: (l, t) => ({ alpha: enter(l, t) }),
  },
  {
    id: "fadeInUp",
    nameAr: "ظهور من الأسفل",
    isLoop: false,
    apply: (l, t, _w, h) => {
      const p = enter(l, t);
      return { alpha: p, offsetY: -(1 - p) * (h * 0.06) };
    },
  },
  {
    id: "fadeInDown",
    nameAr: "ظهور من الأعلى",
    isLoop: false,
    apply: (l, t, _w, h) => {
      const p = enter(l, t);
      return { alpha: p, offsetY: (1 - p) * (h * 0.06) };
    },
  },
  {
    id: "fadeInRight",
    nameAr: "ظهور من اليمين",
    isLoop: false,
    apply: (l, t, w) => {
      const p = enter(l, t);
      return { alpha: p, offsetX: (1 - p) * (w * 0.05) };
    },
  },
  {
    id: "fadeInLeft",
    nameAr: "ظهور من اليسار",
    isLoop: false,
    apply: (l, t, w) => {
      const p = enter(l, t);
      return { alpha: p, offsetX: -(1 - p) * (w * 0.05) };
    },
  },
  {
    id: "scaleUp",
    nameAr: "تكبير سلس",
    isLoop: false,
    apply: (l, t) => {
      const p = easeOutQuad(progressAt(t, l.animDelay, Math.max(0.05, l.animDuration)));
      return { alpha: id(p), scale: 0.82 + 0.18 * p };
    },
  },
  {
    id: "popIn",
    nameAr: "ظهور نابض",
    isLoop: false,
    apply: (l, t) => {
      const p = easeOutBack(progressAt(t, l.animDelay, Math.max(0.05, l.animDuration)));
      return { alpha: Math.min(1, p * 1.6), scale: Math.max(0.001, p) };
    },
  },
  {
    id: "typewriter",
    nameAr: "كتابة تدريجية",
    isLoop: false,
    apply: (l, t, w) => {
      const p = easeOutCubic(progressAt(t, l.animDelay, Math.max(0.5, l.animDuration)));
      return { clipX: p, offsetX: -(1 - p) * (w * 0.001) };
    },
  },
  {
    id: "rotateIn",
    nameAr: "دخول دوّار",
    isLoop: false,
    apply: (l, t) => {
      const p = easeOutBack(progressAt(t, l.animDelay, Math.max(0.05, l.animDuration)));
      return { alpha: Math.min(1, p * 1.4), rot: (1 - p) * 20, scale: Math.max(0.001, p) };
    },
  },
  {
    id: "wipeIn",
    nameAr: "كشف بمسح",
    isLoop: false,
    apply: (l, t) => ({
      clipX: easeOutQuad(progressAt(t, l.animDelay, Math.max(0.05, l.animDuration))),
    }),
  },
  {
    id: "bounceIn",
    nameAr: "ظهور مرتد",
    isLoop: false,
    apply: (l, t, _w, h) => {
      const p = easeOutBounce(progressAt(t, l.animDelay, Math.max(0.05, l.animDuration)));
      return { alpha: Math.min(1, p * 2.2), scale: Math.max(0.001, p), offsetY: -(1 - p) * (h * 0.03) };
    },
  },
  {
    id: "blurIn",
    nameAr: "ظهور ضبابي",
    isLoop: false,
    apply: (l, t, w) => {
      const p = easeOutQuad(progressAt(t, l.animDelay, Math.max(0.05, l.animDuration)));
      return { alpha: p, blur: (1 - p) * 14 * (w / 1920) };
    },
  },
  {
    id: "pulse",
    nameAr: "نبض مستمر",
    isLoop: true,
    apply: (_l, t) => {
      if (t <= 0) return {};
      return { scale: 1 + 0.04 * Math.sin(t * 4) };
    },
  },
  {
    id: "shake",
    nameAr: "اهتزاز",
    isLoop: true,
    apply: (_l, t, w) => {
      if (t <= 0) return {};
      return { offsetX: Math.sin(t * 30) * 6 * (w / 1920) };
    },
  },
];

export function getPreset(idName: MotionPresetId): MotionPresetDef {
  return MOTION_PRESETS.find((p) => p.id === idName) ?? MOTION_PRESETS[0];
}

const DEFAULT_TRANSFORM: LayerTransform = {
  alpha: 1,
  scale: 1,
  rot: 0,
  clipX: 1,
  offsetX: 0,
  offsetY: 0,
  blur: 0,
};

export function evalTransform(
  layer: Layer,
  tLocal: number,
  canvasW: number,
  canvasH: number,
): LayerTransform {
  const preset = getPreset(layer.anim);
  const patch = preset.apply(layer, tLocal, canvasW, canvasH);
  const merged = { ...DEFAULT_TRANSFORM, ...patch };
  const kf = evalKeyframes(layer, tLocal);
  if (kf) {
    if (typeof kf.opacity === "number") merged.alpha = Math.max(0, Math.min(1, kf.opacity));
    if (typeof kf.scale === "number") merged.scale = Math.max(0.001, kf.scale);
    if (typeof kf.rot === "number") merged.absRot = kf.rot;
    if (typeof kf.offsetX === "number") merged.offsetX = kf.offsetX * canvasW;
    if (typeof kf.offsetY === "number") merged.offsetY = kf.offsetY * canvasH;
    if (typeof kf.blur === "number") merged.blur = Math.max(0, kf.blur);
    if (typeof kf.x === "number") merged.effX = kf.x;
    if (typeof kf.y === "number") merged.effY = kf.y;
  }
  if (merged.clipX > 1) merged.clipX = 1;
  if (merged.clipX < 0) merged.clipX = 0;
  if (merged.scale <= 0) merged.scale = 0.001;
  return merged;
}

// ---------- camera ----------

export interface CameraState {
  zoom: number;
  panX: number;
  panY: number;
}

export function evalCamera(scene: Scene, tLocal: number): CameraState {
  const camKf = evalCameraKeyframes(scene.camera, tLocal);
  if (camKf) {
    return {
      zoom: Math.max(0.1, camKf.zoom ?? scene.camera.zoom),
      panX: camKf.panX ?? 0,
      panY: camKf.panY ?? 0,
    };
  }
  const p = easeOutCubic(progressAt(tLocal, 0, Math.max(0.5, scene.duration)));
  return {
    zoom: 1 + (scene.camera.zoom - 1) * p,
    panX: scene.camera.panX * p,
    panY: scene.camera.panY * p,
  };
}

// ---------- transitions ----------

export interface TransitionState {
  alpha: number;
  translateX: number;
  translateY: number;
  scale: number;
  wipe: number;
}

export const TRANSITIONS: { id: SceneTransitionId; nameAr: string }[] = [
  { id: "none", nameAr: "بدون انتقال" },
  { id: "fade", nameAr: "تلاشٍ" },
  { id: "slideLeft", nameAr: "انزلاق يسار" },
  { id: "slideUp", nameAr: "انزلاق أعلى" },
  { id: "zoomIn", nameAr: "تكبير" },
  { id: "wipeRight", nameAr: "مسح يمين" },
];

export function evalTransitionIn(
  tLocal: number,
  transition: SceneTransitionId,
  dur: number,
): TransitionState {
  const state: TransitionState = { alpha: 1, translateX: 0, translateY: 0, scale: 1, wipe: 1 };
  if (transition === "none" || dur <= 0 || tLocal >= dur) return state;
  const q = easeOutQuad(progressAt(tLocal, 0, dur));
  switch (transition) {
    case "fade":
      state.alpha = q;
      break;
    case "slideLeft":
      state.translateX = 1 - q;
      break;
    case "slideUp":
      state.translateY = 1 - q;
      break;
    case "zoomIn":
      state.scale = 0.85 + 0.15 * q;
      state.alpha = q;
      break;
    case "wipeRight":
      state.wipe = q;
      break;
  }
  return state;
}

// ---------- backgrounds ----------

export const BACKGROUND_STYLES: { id: BackgroundStyleId; nameAr: string }[] = [
  { id: "solid", nameAr: "لون ثابت" },
  { id: "gradientCalm", nameAr: "تدرج هادئ" },
  { id: "gradientMove", nameAr: "تدرج متحرك" },
  { id: "particles", nameAr: "جسيمات" },
  { id: "waves", nameAr: "موجات" },
  { id: "dotsGrid", nameAr: "شبكة نقاط" },
  { id: "darkCinema", nameAr: "سينمائي داكن" },
  { id: "techGrid", nameAr: "تقني" },
  { id: "paper", nameAr: "ورقي" },
  { id: "spotlight", nameAr: "إضاءة مسرحية" },
];

export function seededRand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export { linear, progressAt };
