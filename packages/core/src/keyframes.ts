// نظام Keyframes — استيفاء قيم مُحرَّكة لكل خاصية على حدة.
// لكل خاصية مُفاتيحها: قبل أول مفتاح تلزم قيمته، وبعد آخره، وبينهما lerp بمِنحنى مفتاح النهاية.
// المفاتيح تتجاوز الـ preset. المصدر الوحيد للحقيقة: layer.keyframes / scene.camera.keyframes.

import type { CameraKeyframe, Keyframe } from "./types";
import { easeInQuad, easeInOutQuad, easeOutBack, easeOutQuad, linear, lerp } from "./easing";
import type { EasingFn } from "./easing";

export const KEYFRAME_EASINGS: Record<string, EasingFn> = {
  linear,
  easeIn: easeInQuad,
  easeOut: easeOutQuad,
  easeInOut: easeInOutQuad,
  easeOutBack,
};

export type KeyframeScalarNames = "x" | "y" | "scale" | "rot" | "opacity" | "offsetX" | "offsetY" | "blur";
export type CameraScalarNames = "zoom" | "panX" | "panY";

function easeFn(ease?: string): EasingFn {
  return (ease && KEYFRAME_EASINGS[ease]) || linear;
}

/** استيفاء خاصية واحدة مفاتيحها مرتبة زمنياً — داخل الدالة تفرز مرة إضافية تحسّباً. */
export function interpolateTrack(
  keyframes: { t: number; value: number; ease?: string }[],
  t: number,
): number {
  if (!keyframes.length) return 0;
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return sorted[0].value;
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].value;
  for (let i = 1; i < sorted.length; i += 1) {
    if (t <= sorted[i].t) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const span = Math.max(1e-6, b.t - a.t);
      const p = easeFn(b.ease)((t - a.t) / span);
      return lerp(a.value, b.value, p);
    }
  }
  return sorted[sorted.length - 1].value;
}

function propertyTrack(keyframes: Keyframe[], prop: KeyframeScalarNames) {
  const out: { t: number; value: number; ease?: string }[] = [];
  for (const kf of keyframes) {
    const v = kf[prop];
    if (typeof v === "number") out.push({ t: kf.t, value: v, ease: kf.ease });
  }
  return out;
}

/**
 * يقيّم مفاتيح الطبقة عند لحظة محلية — يعيد جزءاً فقط من الخصائص المُحرَّكة فعلاً؛
 * `null` يعني لا مفاتيح (يتحكم الـ preset كما هو).
 */
export function evalKeyframes(
  layer: { keyframes?: Keyframe[] },
  tLocal: number,
): Partial<Record<KeyframeScalarNames, number>> | null {
  const kfs = layer.keyframes;
  if (!kfs || !kfs.length) return null;
  const out: Partial<Record<KeyframeScalarNames, number>> = {};
  const props: KeyframeScalarNames[] = ["x", "y", "scale", "rot", "opacity", "offsetX", "offsetY", "blur"];
  for (const prop of props) {
    const track = propertyTrack(kfs, prop);
    if (track.length) out[prop] = interpolateTrack(track, tLocal);
  }
  return Object.keys(out).length ? out : null;
}

/** يقيّم مفاتيح الكاميرا — `null` إذا لا مفاتيح. */
export function evalCameraKeyframes(
  camera: { keyframes?: CameraKeyframe[] },
  tLocal: number,
): Partial<Record<CameraScalarNames, number>> | null {
  const kfs = camera.keyframes;
  if (!kfs || !kfs.length) return null;
  const out: Partial<Record<CameraScalarNames, number>> = {};
  for (const prop of ["zoom", "panX", "panY"] as CameraScalarNames[]) {
    const track: { t: number; value: number; ease?: string }[] = [];
    for (const kf of kfs) {
      const v = kf[prop];
      if (typeof v === "number") track.push({ t: kf.t, value: v, ease: kf.ease });
    }
    if (track.length) out[prop] = interpolateTrack(track, tLocal);
  }
  return Object.keys(out).length ? out : null;
}
