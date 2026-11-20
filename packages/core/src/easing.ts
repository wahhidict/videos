export type EasingFn = (t: number) => number;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export const linear: EasingFn = (t) => clamp01(t);

export const easeInQuad: EasingFn = (t) => {
  t = clamp01(t);
  return t * t;
};

export const easeOutQuad: EasingFn = (t) => {
  t = clamp01(t);
  return 1 - (1 - t) * (1 - t);
};

export const easeInOutQuad: EasingFn = (t) => {
  t = clamp01(t);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

export const easeOutCubic: EasingFn = (t) => {
  t = clamp01(t);
  return 1 - Math.pow(1 - t, 3);
};

export const easeOutBack: EasingFn = (t) => {
  t = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const easeOutBounce: EasingFn = (t) => {
  t = clamp01(t);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export const easeOutElastic: EasingFn = (t) => {
  t = clamp01(t);
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function progressAt(now: number, start: number, dur: number): number {
  if (dur <= 0) return now >= start ? 1 : 0;
  return clamp01((now - start) / dur);
}

