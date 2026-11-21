import { describe, expect, it } from "vitest";
import {
  deriveTopic,
  planSceneCount,
  planStoryboard,
  regenerateScenePlan,
  sanitizeContent,
  scaleDurations,
  buildDocFromPlan,
  formatDurationAr,
  wavDurationSeconds,
  encodeWavMono,
  totalDuration,
} from "../src/index";
import type { VideoTypeId } from "../src/index";

const DIRTY_IDEA =
  "أنشئ فيديو موشن جرافيك عن أهمية شرب الماء لمدة 30 ثانية، استخدم رسومات توضيحية متحركة، اجعل الفيديو ممتعاً بصرياً، مع تعليق صوتي عربي وموسيقى";

const LEAK_WORDS = ["أنشئ", "اصنع", "اجعل", "استخدم", "بأسلوب", "فيديو", "موسيقى", "موشن"];

describe("deriveTopic", () => {
  it("يستخرج الموضوع دون تعليمات الإنتاج", () => {
    const topic = deriveTopic(DIRTY_IDEA);
    expect(topic).toContain("شرب الماء");
    for (const word of LEAK_WORDS) expect(topic).not.toContain(word);
  });

  it("يظل معقولاً عند فكرة نظيفة", () => {
    expect(deriveTopic("فوائد المشي اليومي")).toContain("المشي");
  });
});

describe("planSceneCount", () => {
  it("30 ثانية ≈ 4-6", () => {
    expect(planSceneCount(30)).toBeGreaterThanOrEqual(4);
    expect(planSceneCount(30)).toBeLessThanOrEqual(6);
  });
  it("دقيقة ≈ 6-9", () => {
    expect(planSceneCount(60)).toBeGreaterThanOrEqual(6);
    expect(planSceneCount(60)).toBeLessThanOrEqual(9);
  });
  it("3 دقائق ≈ 10-18", () => {
    expect(planSceneCount(180)).toBeGreaterThanOrEqual(10);
    expect(planSceneCount(180)).toBeLessThanOrEqual(18);
  });
});

describe("planStoryboard", () => {
  const types: VideoTypeId[] = ["educational", "documentary", "story", "ad", "motion", "youtube", "reels", "finance", "trading"];

  it("لا مشاهد مكررة ولا تسريب تعليمات (educational 30s)", () => {
    const plan = planStoryboard(DIRTY_IDEA, "educational", 30);
    expect(plan.scenes.length).toBeGreaterThanOrEqual(4);
    expect(plan.scenes.length).toBeLessThanOrEqual(6);
    const keys = new Set(plan.scenes.map((s) => `${s.onScreen}|${s.voiceover}`));
    expect(keys.size).toBe(plan.scenes.length);
    for (const scene of plan.scenes) {
      for (const word of LEAK_WORDS) {
        expect(scene.onScreen).not.toContain(word);
        expect(scene.voiceover).not.toContain(word);
      }
    }
    expect(plan.topic).toContain("شرب الماء");
  });

  it("مجموع المدد قريب من الهدف لكل الأنواع", () => {
    for (const type of types) {
      for (const sec of [30, 60, 180]) {
        const plan = planStoryboard("فكرة تعليمية عن قراءة الكتب", type, sec);
        const sum = plan.scenes.reduce((a, s) => a + s.duration, 0);
        expect(sum).toBeGreaterThan(sec * 0.8);
        expect(sum).toBeLessThan(sec * 1.2);
        expect(plan.scenes.length).toBeGreaterThan(1);
      }
    }
  });

  it("أرقام عشرية معقولة في المدد (خانة واحدة)", () => {
    const plan = planStoryboard(DIRTY_IDEA, "educational", 30);
    for (const s of plan.scenes) {
      expect(Math.round(s.duration * 10)).toBeCloseTo(s.duration * 10, 6);
    }
  });

  it("scaleDurations يبقي المجموع ضمن ±20٪", () => {
    const plan = planStoryboard("قصة قصيرة", "story", 45);
    expect(Math.abs(plan.scenes.reduce((a, s) => a + s.duration, 0) - 45) / 45).toBeLessThan(0.2);
  });
});

describe("regenerateScenePlan", () => {
  it("يعيد مشهداً واحداً بلا تكرار مع آخر", () => {
    const plan = planStoryboard(DIRTY_IDEA, "educational", 60);
    const variant = regenerateScenePlan(DIRTY_IDEA, "educational", 1, plan.scenes.length, 3);
    expect(variant).not.toBeNull();
    expect(variant!.onScreen.length).toBeGreaterThan(2);
    expect(variant!.voiceover.length).toBeGreaterThan(10);
  });
});

describe("sanitizeContent", () => {
  it("ينظّف التعليمات المباشرة", () => {
    const out = sanitizeContent("أنشئ فيديو موشن جرافيك عن شرب الماء بأسلوب ممتع بصرياً");
    expect(out).not.toContain("أنشئ");
    expect(out).not.toContain("فيديو");
    expect(out).not.toContain("بأسلوب");
    expect(out).toContain("شرب الماء");
  });
  it("لا يعيد نصاً فارغاً", () => {
    expect(sanitizeContent("أنشئ فيديو").length).toBeGreaterThan(0);
  });
});

describe("buildDocFromPlan", () => {
  it("يبني مشاهد بخطاب صوتي ومدة وبيانات meta", () => {
    const plan = planStoryboard(DIRTY_IDEA, "educational", 30);
    const doc = buildDocFromPlan(
      {
        schemaVersion: 1, id: "x", name: "n", createdAt: "", updatedAt: "", lang: "ar",
        canvas: { width: 1920, height: 1080, fps: 30 }, scenes: [], audio: [], subtitles: [],
        subtitleStyle: { enabled: true, fontSize: 48, color: "#fff", highlightColor: "#ffd54a", position: 0.9, animated: true },
        voice: { mode: "none", voice: null, speed: 1 }, quality: "balanced",
      } as never,
      plan,
      "infographic",
      "educational",
      DIRTY_IDEA,
    );
    expect(doc.scenes.length).toBe(plan.scenes.length);
    doc.scenes.forEach((scene, i) => {
      expect(scene.voiceScript).toBe(plan.scenes[i].voiceover);
      expect(scene.script).toBe(plan.scenes[i].onScreen);
      expect(scene.duration).toBeGreaterThan(0);
      expect(scene.layers.length).toBeGreaterThan(0);
    });
    expect(doc.meta?.idea).toBe(DIRTY_IDEA);
    expect(doc.meta?.plan?.length).toBe(plan.scenes.length);
    expect(Math.abs(totalDuration(doc) - 30) / 30).toBeLessThan(0.2);
  });
});

describe("formatDurationAr", () => {
  it("يعرض ثوانٍ مفهومة", () => {
    expect(formatDurationAr(7.5)).toBe("7.5 ثوانٍ");
    expect(formatDurationAr(7)).toBe("7 ثوانٍ");
  });
  it("يعرض دقائق بصيغة mm:ss", () => {
    expect(formatDurationAr(75)).toBe("01:15");
  });
});

describe("wavDurationSeconds", () => {
  it("يقيس WAV اصطناعي بدقة", () => {
    const rate = 22050;
    const oneSec = new Int16Array(rate);
    for (let i = 0; i < rate; i += 1) oneSec[i] = Math.round(Math.sin((i / rate) * 440 * 2 * Math.PI) * 8000);
    const wav = encodeWavMono(oneSec, rate);
    const dur = wavDurationSeconds(wav);
    expect(dur).not.toBeNull();
    expect(dur!).toBeGreaterThan(0.95);
    expect(dur!).toBeLessThan(1.05);
  });

  it("يرفض ملفات غير WAV", () => {
    expect(wavDurationSeconds(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    const bad = new Uint8Array(64);
    bad.set([0x49, 0x44, 0x33], 0); // ID3
    expect(wavDurationSeconds(bad)).toBeNull();
  });

  it("يتعامل مع WAVE_FORMAT_EXTENSIBLE", () => {
    const rate = 22050;
    const samples = new Int16Array(rate);
    const wav = encodeWavMono(samples, rate);
    const bytes = new Uint8Array(wav);
    // fmt: formatTag at offset 20 → set to 0xFFFE and extend chunk
    const view = new DataView(bytes.buffer);
    view.setUint16(20, 0xfffe, true);
    expect(wavDurationSeconds(bytes)).not.toBeNull();
  });
});
