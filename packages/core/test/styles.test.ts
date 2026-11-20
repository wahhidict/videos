import { describe, expect, it } from "vitest";
import { STYLE_DIRECTIONS, buildStyleGuide, directProject } from "../src/director";
import { buildDocFromPlan } from "../src/builder";
import type { StyleId, VideoTypeId } from "../src/script";
import type { ProjectDoc } from "../src/types";

const STYLES: StyleId[] = ["cinematic", "professional", "threed", "infographic", "minimal", "tech", "documentary"];

function docFor(style: StyleId): ProjectDoc {
  const input = {
    idea: "أهمية شرب الماء يومياً للجسم",
    type: "educational" as VideoTypeId,
    style,
    audience: "general" as const,
    platform: "youtube" as const,
    durationSeconds: 30,
  };
  const plan = directProject(input);
  const doc: ProjectDoc = { canvas: { width: 1920, height: 1080, fps: 30 }, scenes: [], audio: [], subtitles: [], lang: "ar", name: "اختبار", voice: { enabled: true, mode: "none", rate: 1, pitch: 1 }, quality: "balanced", subtitleStyle: { enabled: false, font: { family: "Cairo", size: 40, weight: 700, color: "#fff" }, position: 0.88, animated: false } };
  return buildDocFromPlan(doc, plan.plan, style, input.type);
}

describe("دلائل الإخراج لكل نمط", () => {
  it("كل نمط معرّف بكامل الحقول الخمسة", () => {
    for (const s of STYLES) {
      const d = STYLE_DIRECTIONS[s];
      expect(d.transitions.length).toBeGreaterThanOrEqual(2);
      expect(d.motion.length).toBeGreaterThanOrEqual(2);
      expect(d.cameraBias.length).toBeGreaterThanOrEqual(2);
      expect(d.lighting.length).toBeGreaterThan(10);
      expect(d.grammarAr.length).toBeGreaterThan(10);
    }
  });

  it("الأنماط تختلف فعلاً — لا تكرار الهوية بين زوجين على الأقل", () => {
    const uniqueTransitions = new Set(STYLES.map((s) => STYLE_DIRECTIONS[s].transitions.join("/")));
    expect(uniqueTransitions.size).toBeGreaterThanOrEqual(5);
  });

  it("buildStyleGuide يتلوّن بالنمط: انتقالات المخرج من دليل النمط", () => {
    const g = buildStyleGuide("infographic", "educational");
    expect(g.transitionLanguage).toEqual(STYLE_DIRECTIONS.infographic.transitions);
    expect(g.motionSignature).toEqual(STYLE_DIRECTIONS.infographic.motion);
    expect(g.grammarAr).toContain("إنفوغرافيك");
  });

  it("المشاهد المبنية تحتضن لغة انتقالات النمط (بعد المشهد الأول)", () => {
    const doc = docFor("infographic");
    expect(doc.scenes.length).toBeGreaterThan(2);
    for (let i = 1; i < doc.scenes.length - 1; i += 1) {
      expect(STYLE_DIRECTIONS.infographic.transitions).toContain(doc.scenes[i].transitionIn);
    }
  });

  it("نمط cinematic يختلف عن infographic في الانتقالات للمشهد الثاني", () => {
    const a = docFor("cinematic").scenes[1].transitionIn;
    const b = docFor("infographic").scenes[1].transitionIn;
    expect(a).not.toBe(b);
  });

  it("حركة النص في المشهد الأول تأتي من توقيع حركة النمط", () => {
    const doc = docFor("minimal");
    expect(STYLE_DIRECTIONS.minimal.motion).toContain((doc.scenes[0].layers[0] as { anim: string }).anim);
  });

  it("أسماء الأنماط موجودة في كل القاموسين بلا مفاتيح ناقصة", () => {
    const keys = Object.keys(STYLE_DIRECTIONS).sort();
    expect(keys).toEqual([...STYLES].sort());
  });
});
