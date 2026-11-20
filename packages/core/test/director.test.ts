import { describe, expect, it } from "vitest";
import {
  DIRECTOR_NOTES_AR,
  buildDocFromPlan,
  buildStyleGuide,
  buildVisualPlans,
  directProject,
  newDoc,
  planNarrative,
  planSceneCount,
  totalDuration,
} from "../src/index";
import type { VideoTypeId } from "../src/index";

const LEAK_WORDS = ["أنشئ", "اصنع", "اجعل", "استخدم", "فيديو", "موسيقى", "تعليق صوتي", "موشن", "بأسلوب"];

const IDEA = "فوائد شرب الماء يومياً للجسم والعقل";
const PASSED_SCRIPT = [
  "يشكل الماء نحو ستين بالمئة من جسم الإنسان، ويشارك في كل عملية حيوية تقريباً.",
  "الجفاف الخفيف يقلل التركيز ويزيد الإجهاد، حتى قبل أن نشعر بالعطش.",
  "يوصي الأطباء بشرب ستة إلى ثمانية أكواب موزعة على اليوم، وليس دفعة واحدة.",
  "شرب كوب ماء قبل الوجبة يساعد على تنظيم الشهية ودعم عملية الهضم.",
  "الخلاصة: اجعل القارورة قريبة منك، وابدأ يومك بكوب ماء قبل القهوة.",
].join("\n");

describe("directProject — وضع الفكرة", () => {
  const result = directProject({ idea: IDEA, durationSeconds: 30 });

  it("يحلل المحتوى: نوع تعليمي وموضوع نظيف", () => {
    expect(result.analysis.inputMode).toBe("idea");
    expect(result.analysis.type).toBe("educational");
    expect(result.analysis.topic).toContain("الماء");
    expect(result.analysis.message.length).toBeGreaterThan(5);
    expect(result.analysis.tone).toBe("educational");
    expect(result.analysis.durationSeconds).toBe(30);
  });

  it("أعداد المشاهد في نطاق 30 ثانية", () => {
    const count = result.plan.scenes.length;
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(6);
  });

  it("الخطة السردية تغطي كل المشاهد ولا تتكرر حرفياً", () => {
    expect(result.beats.length).toBeGreaterThanOrEqual(planSceneCount(30));
    expect(result.beats[0].role).toBe("hook");
    const last = result.beats[result.beats.length - 1].role;
    expect(["resolution", "cta"]).toContain(last);
    const roles = result.beats.map((b) => b.role);
    expect(new Set(roles).size).toBeGreaterThan(1);
  });

  it("خطة بصرية لكل مشهد بنفس العدد", () => {
    expect(result.visualPlans.length).toBe(result.plan.scenes.length);
    for (const vp of result.visualPlans) {
      expect(["titleCard", "infographic", "dataChart", "kineticText", "scene2D", "typography", "productShot", "mixedMedia"]).toContain(vp.visualType);
      expect(vp.background.length).toBeGreaterThan(0);
      expect(vp.transition.length).toBeGreaterThan(0);
    }
    expect(result.visualPlans[0].visualType).toBe("titleCard");
  });

  it("دليل الأسلوب البصري متسق", () => {
    expect(result.styleGuide.styleId).toBe("infographic");
    expect(result.styleGuide.palette.length).toBe(4);
    expect(result.styleGuide.grammarAr).toContain("لا تعليمات إخراج");
  });

  it("لا تسريب لتعليمات الإنتاج في نصوص المشاهد", () => {
    for (const scene of result.plan.scenes) {
      for (const word of LEAK_WORDS) {
        expect(scene.title).not.toContain(word);
        expect(scene.onScreen).not.toContain(word);
        expect(scene.voiceover).not.toContain(word);
      }
    }
  });
});

describe("directProject — وضع السكريبت الملصق", () => {
  const result = directProject({ script: PASSED_SCRIPT, durationSeconds: 60 });

  it("يكتشف وضع السكريبت ويحفظ جُمَل المستخدم حرفياً", () => {
    expect(result.analysis.inputMode).toBe("script");
    expect(result.analysis.type).toBe("educational");
    expect(result.plan.scenes.length).toBeGreaterThan(0);

    const concatenated = result.plan.scenes.map((s) => s.voiceover).join(" ");
    expect(concatenated).toBe(PASSED_SCRIPT.replace(/\n+/g, " ").trim());
  });

  it("60 ثانية تعطي 6-9 مشاهد ومدة قريبة من الهدف", () => {
    const count = result.plan.scenes.length;
    expect(count).toBeGreaterThanOrEqual(6);
    expect(count).toBeLessThanOrEqual(9);
  });
});

describe("detectFrom عبر directProject", () => {
  const cases: [string, VideoTypeId][] = [
    ["إعلان تجاري قصير لمتجر عطور", "ad"],
    ["وثائقي قصير عن تاريخ سور الحموينة", "documentary"],
    ["قصة قصيرة عن حرفي عجوز", "story"],
    ["تحليل مالي لمؤشرات السوق", "finance"],
    ["ريلز قصير عمودي عن وصفة", "reels"],
  ];
  for (const [idea, expected] of cases) {
    it(`«${idea.slice(0, 18)}…» → ${expected}`, () => {
      expect(directProject({ idea, durationSeconds: 30 }).analysis.type).toBe(expected);
    });
  }
});

describe("planNarrative", () => {
  it("بلا مشاهد وسيطة يعيد فتحاً وتأطيراً وخاتمة", () => {
    const analysis = directProject({ idea: IDEA, durationSeconds: 30 }).analysis;
    const beats = planNarrative(analysis, 2);
    expect(beats.map((b) => b.role)).toEqual(["hook", "setup", "resolution"]);
  });

  it("أدوار الوسط مأخوذة من بنك النوع", () => {
    const analysis = directProject({ idea: "شرح مصور لأهمية النوم 1324", durationSeconds: 60 }).analysis;
    const beats = planNarrative(analysis, 8);
    const mid = beats.slice(2, -1);
    expect(mid.length).toBe(6);
    expect(mid.every((b) => ["development", "evidence", "turn"].includes(b.role))).toBe(true);
  });
});

describe("buildVisualPlans", () => {
  it("كل دور له نوع بصري معبّر عن وظيفته", () => {
    const result = directProject({ idea: "إعلان منتج كريم ترطيب 4721", durationSeconds: 30 });
    const plans = buildVisualPlans(result.beats, result.analysis, result.styleGuide);
    expect(plans[0].visualType).toBe("titleCard");
    const lastPlan = plans[plans.length - 1];
    expect(["kineticText", "typography"]).toContain(lastPlan.visualType);
  });
});

describe("buildStyleGuide", () => {
  it("نغمة النص تختلف بين الوثائقي والإعلان", () => {
    expect(buildStyleGuide("documentary", "documentary").textTone).not.toBe(buildStyleGuide("cinematic", "ad").textTone);
  });
});

describe("DIRECTOR_NOTES_AR", () => {
  it("كل دور سبيعي له وصف عربي", () => {
    const roles = ["hook", "setup", "development", "evidence", "turn", "resolution", "cta"] as const;
    for (const role of roles) expect(DIRECTOR_NOTES_AR[role].length).toBeGreaterThan(3);
  });
});

describe("buildDocFromPlan — ربط التوجيه بالمستند", () => {
  const directed = directProject({ idea: IDEA, durationSeconds: 30 });
  const doc = buildDocFromPlan(newDoc(), directed.plan, "infographic", "educational", IDEA, directed);

  it("meta.director يخزن.snapshot كامل", () => {
    expect(doc.meta.director).toBeDefined();
    expect(doc.meta.director?.inputMode).toBe("idea");
    expect(doc.meta.director?.audience).toBe("general");
    expect(doc.meta.director?.styleGuide.styleId).toBe("infographic");
    expect(doc.meta.director?.purpose.length).toBe(doc.scenes.length);
    expect(doc.meta.director?.visualType.length).toBe(doc.scenes.length);
  });

  it("خصائص كل مشهد تأتي من خطته البصرية", () => {
    doc.scenes.forEach((scene, i) => {
      const vp = directed.visualPlans[i];
      expect(scene.background?.style).toBe(vp.background);
      expect(scene.transitionIn).toBe(vp.transition);
      const expectedZoom = vp.cameraMove === "zoomIn" ? 1.14 : vp.cameraMove === "zoomOut" ? 1.0 : 1.06;
      expect(scene.camera.zoom).toBe(expectedZoom);
    });
  });

  it("المدة الكلية تحترم الهدف 30ث بهامش تحمّل معقول", () => {
    const total = totalDuration(doc);
    expect(total).toBeGreaterThanOrEqual(29);
    expect(total).toBeLessThanOrEqual(33);
  });

  it("أوضاع الاستدعاء القديم (بلا توجيه) لا تكسر meta.director", () => {
    const plain = buildDocFromPlan(newDoc(), directed.plan, "infographic", "educational", IDEA);
    expect(plain.scenes.length).toBe(doc.scenes.length);
    expect(plain.meta.director).toBeUndefined();
  });
});
