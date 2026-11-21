import { describe, expect, it } from "vitest";
import { evalKeyframes, evalCameraKeyframes, interpolateTrack } from "../src/keyframes";
import { evalCamera, evalTransform } from "../src/presets";
import type { Layer, Scene } from "../src/types";

function textLayer(withKeys: boolean, keyframes?: Layer["keyframes"]): Layer {
  return {
    id: "l1",
    name: "نص",
    kind: "text",
    text: "مرحبا",
    font: { family: "Cairo", size: 40, weight: 700, color: "#fff" },
    align: "center",
    lineHeight: 1.3,
    x: 0.2,
    y: 0.3,
    w: 0.5,
    opacity: 1,
    startAt: 0,
    anim: "none",
    animDuration: 0.5,
    animDelay: 0,
    rot: 0,
    keyframes: withKeys ? keyframes : undefined,
  };
}

function sceneWithCamera(camera: Scene["camera"]): Scene {
  return {
    id: "s1",
    title: "مشهد",
    script: "",
    duration: 5,
    background: { style: "solid", color: "#000", color2: "#111" },
    transitionIn: "fade",
    transitionDuration: 0.5,
    camera,
    layers: [],
    voiceScript: "",
  };
}

describe("استيفاء المفاتيح", () => {
  it("بلا محارف مفاتيح يعيد null", () => {
    expect(evalKeyframes(textLayer(false), 1)).toBeNull();
  });

  it("قبل أول مفتاح تلزم قيمته وبعد الأخير قيمته", () => {
    const kf = evalKeyframes(textLayer(true, [{ t: 1, x: 0.1 }, { t: 2, x: 0.5 }]), 0);
    expect(kf?.x).toBe(0.1);
    const kf2 = evalKeyframes(textLayer(true, [{ t: 1, x: 0.1 }, { t: 2, x: 0.5 }]), 9);
    expect(kf2?.x).toBe(0.5);
  });

  it("بين مفتاحين lerp خطي، وeaseOut يتقدم أسرع من المنتصف", () => {
    const kf = evalKeyframes(textLayer(true, [
      { t: 0, x: 0.0 },
      { t: 2, x: 1.0, ease: "linear" },
    ]), 1);
    expect(kf?.x).toBeCloseTo(0.5, 5);
    const kf2 = evalKeyframes(textLayer(true, [
      { t: 0, x: 0.0 },
      { t: 2, x: 1.0, ease: "easeOut" },
    ]), 1);
    expect(kf2?.x).toBeGreaterThan(0.5);
  });

  it("كل خاصية مُفاتيحها المنفصلة — y غير موجود لا يُوضّع", () => {
    const kf = evalKeyframes(textLayer(true, [{ t: 0, opacity: 1 }, { t: 1, opacity: 0 }]), 0.5);
    expect(kf?.opacity).toBeCloseTo(0.5, 5);
    expect(kf?.y).toBeUndefined();
  });

  it("interpolateTrack يفرز المفاتيح غير المرتبة", () => {
    const v = interpolateTrack([
      { t: 2, value: 10 },
      { t: 0, value: 0 },
      { t: 1, value: 5 },
    ], 0.5);
    expect(v).toBeCloseTo(2.5, 5);
  });
});

describe("evalTransform مع المفاتيح", () => {
  it("مفاتيح scale/opacity تتجاوز preset", () => {
    const layer = textLayer(true, [
      { t: 0, scale: 1, opacity: 1 },
      { t: 2, scale: 2, opacity: 0 },
    ]);
    const mid = evalTransform(layer, 1, 1920, 1080);
    expect(mid.scale).toBeCloseTo(1.5, 5);
    expect(mid.alpha).toBeCloseTo(0.5, 5);
  });

  it("مفاتيح x/y تعطيه موضعًا فعليًا يستخدمه الرِندر عبر effX/effY", () => {
    const layer = textLayer(true, [
      { t: 0, x: 0.0, y: 0.0 },
      { t: 2, x: 1.0, y: 1.0 },
    ]);
    const mid = evalTransform(layer, 1, 1920, 1080);
    expect(mid.effX).toBeCloseTo(0.5, 5);
    expect(mid.effY).toBeCloseTo(0.5, 5);
  });

  it("مفاتيح rot مطلقة عبر absRot", () => {
    const layer = textLayer(true, [
      { t: 0, rot: 0 },
      { t: 2, rot: 90 },
    ]);
    const mid = evalTransform(layer, 1, 1920, 1080);
    expect(mid.absRot).toBeCloseTo(45, 5);
  });

  it("بلا مفاتيح لا تغيير عن السلوك القديم", () => {
    const layer = textLayer(false);
    const tf = evalTransform(layer, 1, 1920, 1080);
    expect(tf.effX).toBeUndefined();
    expect(tf.absRot).toBeUndefined();
    expect(tf.scale).toBe(1);
  });
});

describe("evalCamera مع المفاتيح", () => {
  it("بلا مفاتيح يعمل الانزلاق الافتراضي", () => {
    const c = evalCamera(sceneWithCamera({ zoom: 1.1, panX: 0.03, panY: 0 }), 2.5);
    expect(c.zoom).toBeGreaterThan(1);
    expect(c.panX).toBeGreaterThan(0);
  });

  it("مفاتيح الكاميرا تتجاوز الافتراضي", () => {
    const c = evalCamera(sceneWithCamera({
      zoom: 1.1, panX: 0.03, panY: 0,
      keyframes: [
        { t: 0, zoom: 1, panX: 0 },
        { t: 5, zoom: 1.5, panX: -0.02 },
      ],
    }), 2.5);
    expect(c.zoom).toBeCloseTo(1.25, 5);
    expect(c.panX).toBeCloseTo(-0.01, 5);
  });

  it("مفاتيح جزئية للكاميرا: panX فقط لا يفسد zoom", () => {
    const c = evalCamera(sceneWithCamera({
      zoom: 1.2, panX: 0.03, panY: 0,
      keyframes: [{ t: 2, panX: 0.05 }],
    }), 4);
    expect(c.zoom).toBeCloseTo(1.2, 5);
    expect(c.panX).toBeCloseTo(0.05, 5);
  });

  it("evalCameraKeyframes يعيد null بلا مفاتيح", () => {
    expect(evalCameraKeyframes({ zoom: 1, panX: 0, panY: 0 }, 1)).toBeNull();
  });
});
