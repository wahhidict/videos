import { describe, expect, it } from "vitest";
import {
  buildPlannerPrompt,
  composeDirectedPlan,
  directProjectSmart,
  extractJsonPayload,
  parsePlannerResponse,
  plannerSceneCount,
  planWithLLM,
  rebalancePlannerDurations,
  requestFromInput,
  scriptCoverageRatio,
  toScenePlans,
  PlannerError,
  type LLMScenePlan,
  type PlannerRequest,
} from "../src/planner";
import { directProject, type DirectorInput } from "../src/director";

const SCRIPT = "جسم الإنسان يحتاج إلى ثمانية أكواب من الماء يومياً.\nالماء ينظم حرارة الجسم ويحسن التركيز.\nعندما يشعر الجسم بالعطش فإن التركيز انخفض بالفعل بنسبة عشرة بالمئة.\nاشرب كوب ماء الآن وستشعر بفرق واضح في نشاطك.";

const baseRequest: PlannerRequest = {
  script: SCRIPT,
  type: "educational",
  style: "infographic",
  durationSeconds: 60,
  arabic: true,
};

const baseInput: DirectorInput = {
  script: SCRIPT,
  type: "educational",
  style: "infographic",
  durationSeconds: 60,
};

function llmScene(partial: Partial<LLMScenePlan>): LLMScenePlan {
  return {
    narrativeGoal: partial.narrativeGoal ?? "تطوير الفكرة",
    visualIdea: partial.visualIdea ?? "أيقونة قطرة ماء تكبر",
    shot: partial.shot ?? "لقطة متوسطة تعرض الأيقونة في المنتصف",
    cameraMove: partial.cameraMove ?? "zoomIn",
    onScreen: partial.onScreen ?? "الماء ضروري للجسم",
    voiceover: partial.voiceover ?? "جسم الإنسان يحتاج إلى ثمانية أكواب من الماء يومياً",
    sfx: partial.sfx ?? "none",
    transition: partial.transition ?? "fade",
    duration: partial.duration ?? 5,
  };
}

function fakeResponse(scenes: Partial<LLMScenePlan>[], wrap = true): string {
  const body = JSON.stringify(
    scenes.map((s) => llmScene(s)),
    null,
    2,
  );
  return wrap ? `بكل سرور!\n\`\`\`json\n${body}\n\`\`\`\nهذه الخطة المقترحة.` : body;
}

describe("buildPlannerPrompt", () => {
  it("يتضمن السكريبت كاملاً حرفياً في وضع السكريبت دون اقتطاع", () => {
    const { user } = buildPlannerPrompt(baseRequest);
    expect(user).toContain(SCRIPT);
    expect(user).toContain("نص المستخدم حرفياً");
  });

  it("يفرض مخطط JSON وحقوله وقاموس الحركات والانتقالات", () => {
    const { system } = buildPlannerPrompt(baseRequest);
    expect(system).toContain("narrativeGoal");
    expect(system).toContain("visualIdea");
    expect(system).toContain("voiceover");
    expect(system).toContain("sfx");
    expect(system).toContain("driftUp");
    expect(system).toContain("wipeRight");
  });

  it("يمنع صراحة تسريب تعليمات الإخراج إلى النص الظاهر", () => {
    const { system } = buildPlannerPrompt({ ...baseRequest, idea: "أهمية شرب الماء" });
    expect(system).toContain("ممنوع أن تظهر تعليمات الإخراج");
    expect(system).toContain("اجعل");
    expect(system).toContain("استخدم");
  });

  it("يطلب العدد المحلي المتوقع من المشاهد", () => {
    const { user } = buildPlannerPrompt({ ...baseRequest, durationSeconds: 180 });
    expect(plannerSceneCount({ ...baseRequest, durationSeconds: 180 })).toBeGreaterThanOrEqual(10);
    expect(user).toContain(String(plannerSceneCount({ ...baseRequest, durationSeconds: 180 })));
  });
});

describe("extractJsonPayload", () => {
  it("يقصّ JSON من وسط نص محاط بسياج code fence", () => {
    const payload = extractJsonPayload(fakeResponse([{ onScreen: "أ" }]));
    expect(Array.isArray(payload)).toBe(true);
  });

  it("يستخرج مصفوفة من داخل كائن { scenes: [...] } وسط حديث", () => {
    const raw = 'تفضل الخطة:\n{"scenes":[{"voiceover":"مرحباً بك","onScreen":"مرحباً"}]}\nانتهى.';
    const payload = extractJsonPayload(raw) as { scenes?: unknown[] };
    expect(Array.isArray(payload.scenes)).toBe(true);
  });

  it("يرمي PlannerError عندما لا يوجد JSON صالح", () => {
    expect(() => extractJsonPayload("لا يوجد هنا شيء")).toThrow(PlannerError);
  });

  it("يتعامل مع أقواس داخل السلاسل النصية دون كسر", () => {
    const raw = 'شرح: {"scenes":[{"voiceover":"قال \\"مرحباً\\" لكل [الناس]"}]}';
    const payload = extractJsonPayload(raw) as { scenes: unknown[] };
    expect(payload.scenes).toHaveLength(1);
  });
});

describe("parsePlannerResponse", () => {
  it("يتعرف على المشاهد الصالحة ويحسب المدد ويوازنها على الهدف", () => {
    const scenes = parsePlannerResponse(
      fakeResponse([
        { voiceover: "جسم الإنسان يحتاج إلى الماء يومياً", onScreen: "أكواب يومياً" },
        { voiceover: "الماء ينظم حرارة الجسم ويحسن التركيز", onScreen: "حرارة وتركيز" },
        { voiceover: "اشرب كوب ماء الآن", onScreen: "اشرب الآن" },
      ]),
      30,
    );
    expect(scenes).toHaveLength(3);
    const total = scenes.reduce((a, s) => a + s.duration, 0);
    expect(Math.abs(total - 30)).toBeLessThanOrEqual(1);
  });

  it("يرفض أي مشهد يبقى فيه تسريب تعليمات إخراج إلى النص الظاهر", () => {
    const scenes = parsePlannerResponse(
      fakeResponse([
        { onScreen: "أنشئ فيديو موشن جرافيك", voiceover: "تعليمية قصيرة" },
        { voiceover: "الماء ضروري للحياة", onScreen: "الماء ضروري" },
        { voiceover: "الترطيب يحسن التركيز", onScreen: "الترطيب" },
      ]),
      30,
    );
    expect(scenes.some((s) => s.onScreen.includes("أنشئ"))).toBe(false);
    expect(scenes.some((s) => s.onScreen.includes("موشن ج"))).toBe(false);
  });

  it("يحذف المشاهد المكرر بصوت متطابق ولا يبقيها قائمة المشاهد", () => {
    const dup = "جسم الإنسان يحتاج إلى ثمانية أكواب من الماء يومياً";
    const scenes = parsePlannerResponse(
      fakeResponse([
        { voiceover: dup },
        { voiceover: dup },
        { voiceover: "الماء ينظم حرارة الجسم" },
      ]),
      30,
    );
    const voices = scenes.map((s) => s.voiceover);
    expect(voices.filter((v) => v === dup)).toHaveLength(1);
  });

  it("يضبط قيم cameraMove وtransition وsfx خارج القواميس المسموحة", () => {
    const scenes = parsePlannerResponse(
      fakeResponse([
        { cameraMove: "superFly", transition: "explosion", sfx: "laser" },
        { voiceover: "مشهد ثانٍ للميزان", sfx: "whoosh" },
      ]),
      30,
    );
    for (const scene of scenes) {
      expect(["still", "zoomIn", "zoomOut", "panLeft", "panRight", "driftUp"]).toContain(scene.cameraMove);
      expect(["none", "fade", "slideLeft", "slideUp", "zoomIn", "wipeRight"]).toContain(scene.transition);
      expect(["none", "whoosh", "click", "pop", "sparkle", "impact", "riser"]).toContain(scene.sfx);
    }
  });

  it("يرمي PlannerError على مشاهد أقل من اثنين", () => {
    expect(() => parsePlannerResponse(fakeResponse([{ voiceover: "مشهد واحد فقط" }]), 30)).toThrow(PlannerError);
  });
});

describe("rebalancePlannerDurations", () => {
  it("يعيد التوازن إلى 180 ثانية مع احترام حدود 2–25 ثانية", () => {
    const scenes = Array.from({ length: 8 }, (_, i) =>
      llmScene({ voiceover: `جملة رقم ${i}`, duration: 30 }),
    );
    rebalancePlannerDurations(scenes, 180);
    const total = scenes.reduce((a, s) => a + s.duration, 0);
    expect(Math.abs(total - 180)).toBeLessThanOrEqual(1);
    expect(scenes.every((s) => s.duration >= 2 && s.duration <= 25)).toBe(true);
  });

  it("أعداد المشاهد في 60 ثانية تقع في النطاق الإرشادي 6–9", () => {
    const count = plannerSceneCount({ ...baseRequest, durationSeconds: 60 });
    expect(count).toBeGreaterThanOrEqual(6);
    expect(count).toBeLessThanOrEqual(9);
  });

  it("أعداد المشاهد في 30 ثانية تقع في النطاق الإرشادي 4–6", () => {
    const count = plannerSceneCount({ ...baseRequest, durationSeconds: 30 });
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(6);
  });
});

describe("scriptCoverageRatio", () => {
  it("نص متطابق مع السكريبت يعطي تغطية عالية", () => {
    const scenes = [
      llmScene({ voiceover: "جسم الإنسان يحتاج إلى ثمانية أكواب من الماء يومياً" }),
      llmScene({ voiceover: "الماء ينظم حرارة الجسم ويحسن التركيز" }),
      llmScene({ voiceover: "عندما يشعر الجسم بالعطش فإن التركيز انخفض بالفعل" }),
      llmScene({ voiceover: "اشرب كوب ماء الآن وستشعر بفرق واضح في نشاطك" }),
    ];
    expect(scriptCoverageRatio(scenes, SCRIPT)).toBeGreaterThan(0.7);
  });

  it("محتوى مخترع بعيد عن السكريبت يعطي تغطية منخفضة", () => {
    const scenes = [
      llmScene({ voiceover: "الفضاء كون واسع مليء بالكواكب الغريبة" }),
      llmScene({ voiceover: "المجرة تلف حول مركزها كل مئات ملايين السنين" }),
      llmScene({ voiceover: "النجوم تتكون من غازات متوهجة ضخمة" }),
      llmScene({ voiceover: "الثقوب السوداء تبتلع الضوء حولها" }),
    ];
    expect(scriptCoverageRatio(scenes, SCRIPT)).toBeLessThan(0.4);
  });
});

describe("planWithLLM", () => {
  it("يمرر السكريبت إلى دالة complete ويحلل الرد إلى مشاهد صالحة", async () => {
    let received = "";
    const scenes = await planWithLLM(baseRequest, {
      complete: async (prompt) => {
        received = prompt;
        return fakeResponse([
          { voiceover: "جسم الإنسان يحتاج إلى ثمانية أكواب من الماء يومياً", onScreen: "أكواب يومياً" },
          { voiceover: "الماء ينظم حرارة الجسم ويحسن التركيز", onScreen: "حرارة وتركيز" },
          { voiceover: "عندما يشعر الجسم بالعطش ينخفض التركيز", onScreen: "التركيز ينخفض" },
          { voiceover: "اشرب كوب ماء الآن وستشعر بفرق واضح", onScreen: "اشرب الآن" },
        ]);
      },
    });
    expect(received).toContain(SCRIPT);
    expect(scenes.length).toBeGreaterThanOrEqual(4);
  });

  it("فشل دالة complete يرفع الخطأ ولا يخفيه", async () => {
    await expect(
      planWithLLM(baseRequest, {
        complete: async () => {
          throw new Error("network down");
        },
      }),
    ).rejects.toThrow("network down");
  });

  it("اختراع محتوى بعيد عن السكريبت يعترضه فحص التغطية", async () => {
    await expect(
      planWithLLM(baseRequest, {
        complete: async () =>
          fakeResponse([
            { voiceover: "الفضاء كون واسع مليء بالكواكب الغريبة" },
            { voiceover: "المجرة تلف حول مركزها كل مئات ملايين السنين" },
          ]),
      }),
    ).rejects.toThrow(PlannerError);
  });
});

describe("composeDirectedPlan + directProjectSmart", () => {
  const scenesRaw = [
    { voiceover: "جسم الإنسان يحتاج إلى ثمانية أكواب من الماء يومياً", onScreen: "أكواب يومياً" },
    { voiceover: "الماء ينظم حرارة الجسم ويحسن التركيز", onScreen: "حرارة وتركيز" },
    { voiceover: "الجفاف يضعف الأداء الذهني ويزيد الإجهاد", onScreen: "الجفاف يضعف الأداء" },
    { voiceover: "الترطيب يحسن أعضاء الجسم ويدير الطاقة", onScreen: "الترطيب" },
    { voiceover: "ابدأ يومك بكوب ماء قبل القهوة", onScreen: "ابدأ بالماء" },
    { voiceover: "اشرب كوب ماء الآن وستشعر بفرق واضح", onScreen: "اشرب الآن" },
  ];

  it("يحافظ على العدد المتفق عليه من المشاهد وتطابق visualPlans مع المشاهد", () => {
    const llmScenes = parsePlannerResponse(fakeResponse(scenesRaw), 60);
    const formed = composeDirectedPlan(baseInput, llmScenes);
    expect(formed.plan.scenes).toHaveLength(llmScenes.length);
    expect(formed.visualPlans).toHaveLength(llmScenes.length);
    expect(formed.beats).toHaveLength(llmScenes.length);
    expect(formed.styleGuide.styleId).toBe("infographic");
  });

  it("أول مشهد عنوان وخاتمة CTA والمجموع قريب من المدة", () => {
    const llmScenes = parsePlannerResponse(fakeResponse(scenesRaw), 60);
    const plans = toScenePlans(llmScenes);
    expect(plans[0].kind).toBe("title");
    expect(plans[plans.length - 1].kind).toBe("cta");
    const total = plans.reduce((a, s) => a + s.duration, 0);
    expect(Math.abs(total - 60)).toBeLessThanOrEqual(1.5);
  });

  it("أدوار السرد: أولها hook وآخرها resolution", () => {
    const llmScenes = parsePlannerResponse(fakeResponse(scenesRaw), 60);
    const formed = composeDirectedPlan(baseInput, llmScenes);
    expect(formed.beats[0].role).toBe("hook");
    expect(formed.beats[formed.beats.length - 1].role).toBe("resolution");
  });

  it("directProjectSmart بلا LLM يعيد engine=local ولا يغير المسار المحلي", async () => {
    const result = await directProjectSmart(baseInput);
    expect(result.engine).toBe("local");
    expect(result.reason).toBeUndefined();
  });

  it("directProjectSmart مع LLM فاشل يسقط للمحلي مع سبب واضح", async () => {
    const result = await directProjectSmart(baseInput, {
      complete: async () => "رد سيئ بلا JSON",
    });
    expect(result.engine).toBe("local");
    expect(typeof result.reason).toBe("string");
    expect(result.reason?.length ?? 0).toBeGreaterThan(3);
  });

  it("directProjectSmart مع LLM ناجح يعطي خطة نموذجية بمشاهد حقيقية", async () => {
    const llm = {
      complete: async () => fakeResponse(scenesRaw),
    };
    const result = await directProjectSmart(baseInput, llm);
    expect(result.engine).toBe("llm");
    expect(result.plan.scenes.length).toBe(scenesRaw.length);
    for (const scene of result.plan.scenes) {
      expect(scene.voiceover.length).toBeGreaterThan(5);
      expect(scene.duration).toBeGreaterThan(0);
    }
  });

  it("المسار المحلي (fallback) السلوك لا شيء منها تغيّر عند وجود planner", () => {
    const local = directProject(baseInput);
    const localSmart = requestFromInput(baseInput);
    expect(localSmart.durationSeconds).toBe(local.plan.targetSeconds);
    expect(localSmart.script).toBe(SCRIPT);
  });
});
