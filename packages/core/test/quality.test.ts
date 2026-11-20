import { describe, expect, it } from "vitest";
import {
  applyAutoFixes,
  buildDocFromPlan,
  directProject,
  newDoc,
  runQualityChecks,
  totalDuration,
  uid,
} from "../src/index";
import type { AudioTrack, ProjectDoc, Scene } from "../src/index";

function makeVoiceTrack(sceneId: string, startAt: number, len: number): AudioTrack {
  return {
    id: uid("aud"),
    assetId: "asset_wav",
    name: "تعليق",
    role: "voice",
    startAt,
    inPoint: 0,
    outPoint: len,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0.2,
    sceneId,
  };
}

function cleanDocWithScenes(count: number): ProjectDoc {
  const directed = directProject({ idea: "فوائد شرب الماء يومياً", durationSeconds: 30 });
  const doc = buildDocFromPlan(newDoc(), directed.plan, "infographic", "educational", "فوائد شرب الماء");
  doc.scenes = doc.scenes.slice(0, count);
  doc.voice = { mode: "none", voice: null, speed: 1 };
  return doc;
}

describe("runQualityChecks — مشروع نظيف", () => {
  it("بلا أخطاء أو تحذيرات: يمر اختبار حقيقي بلا درجة أو نسبة", () => {
    const doc = cleanDocWithScenes(4);
    const report = runQualityChecks(doc);
    expect(report.issues.filter((i) => i.severity !== "info")).toHaveLength(0);
    expect(report.passed).toHaveLength(3);
    expect((report as unknown as Record<string, unknown>).score).toBeUndefined();
  });

  it("أي ملاحظة متبقية في مشروع نظيف هي إنذار معلوماتي فقط", () => {
    const doc = cleanDocWithScenes(4);
    const report = runQualityChecks(doc);
    expect(report.issues.every((i) => i.severity === "info")).toBe(true);
  });
});

describe("runQualityChecks — السرد", () => {
  it("يكتشف مشهداً مكرراً حرفياً ويصلحه فعلية بالحذف", () => {
    const doc = cleanDocWithScenes(4);
    doc.scenes.splice(1, 0, JSON.parse(JSON.stringify(doc.scenes[1])) as Scene);
    const report = runQualityChecks(doc);
    const dup = report.issues.find((i) => i.area === "narrative" && i.autoFix?.kind === "dedupeScene");
    expect(dup).toBeDefined();

    const fixed = applyAutoFixes(doc, report);
    expect(fixed.applied.some((a) => a.kind === "dedupeScene")).toBe(true);
    expect(doc.scenes.length).toBe(4);
    const recheck = runQualityChecks(doc);
    expect(recheck.issues.filter((i) => i.area === "narrative")).toHaveLength(0);
  });
});

describe("runQualityChecks — البصري", () => {
  it("يكتشف مشهداً بلا عناصر بصرية", () => {
    const doc = cleanDocWithScenes(4);
    doc.scenes[2].layers = [];
    const report = runQualityChecks(doc);
    const empty = report.issues.find((i) => i.area === "visual" && i.sceneIndex === 2);
    expect(empty?.severity).toBe("error");
  });

  it("يكتشف عنصراً خارج حدود الإطار", () => {
    const doc = cleanDocWithScenes(4);
    doc.scenes[0].layers[0].x = 1.3;
    const report = runQualityChecks(doc);
    expect(report.issues.some((i) => i.area === "visual" && i.message.includes("خارج حدود الإطار"))).toBe(true);
  });
});

describe("runQualityChecks — الصوت", () => {
  it("يكتشف تعليقاً صوتياً مطلوباً غير موجود (بلا ادعاء وبلا إصلاح زائف)", () => {
    const doc = cleanDocWithScenes(3);
    doc.voice = { mode: "piper", voice: "ar_JO-kareem-medium", speed: 1 };
    doc.audio = [];
    const report = runQualityChecks(doc);
    const missing = report.issues.filter((i) => i.area === "audio" && i.severity === "error");
    expect(missing.length).toBe(3);
    expect(missing.every((i) => i.autoFix === undefined)).toBe(true);
  });

  it("يكتشف موسيقى تغطي الكلام ويطبق ducking فعلياً", () => {
    const doc = cleanDocWithScenes(2);
    doc.audio = [
      { ...makeVoiceTrack(doc.scenes[0].id, 0, 6), volume: 1 },
      {
        id: uid("mus"),
        assetId: "asset_music",
        name: "موسيقى",
        role: "music",
        startAt: 0,
        inPoint: 0,
        outPoint: 20,
        volume: 0.8,
        fadeIn: 0.5,
        fadeOut: 0,
      },
    ];
    const report = runQualityChecks(doc);
    const issue = report.issues.find((i) => i.autoFix?.kind === "rebalanceMusic");
    expect(issue).toBeDefined();

    applyAutoFixes(doc, report);
    const music = doc.audio.find((t) => t.role === "music")!;
    expect(music.volume).toBeLessThanOrEqual(0.25);
    expect(music.fadeOut).toBeGreaterThan(0);
    expect(music.outPoint).toBeLessThanOrEqual(totalDuration(doc) + 0.01);
  });

  it("كبح السرعة فوق 1.25x وتطبيق الحد", () => {
    const doc = cleanDocWithScenes(4);
    doc.voice = { mode: "piper", voice: null, speed: 1.9 };
    const report = runQualityChecks(doc);
    expect(report.issues.some((i) => i.autoFix?.kind === "clampSpeed")).toBe(true);
    applyAutoFixes(doc, report);
    expect(doc.voice.speed).toBe(1.25);
  });

  it("يكتشف مساراً صوتياً فارغاً", () => {
    const doc = cleanDocWithScenes(4);
    doc.audio = [
      {
        id: uid("aud"),
        assetId: "",
        name: "فارغ",
        role: "sfx",
        startAt: 0,
        inPoint: 0,
        outPoint: 1,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
      },
    ];
    const report = runQualityChecks(doc);
    expect(report.issues.some((i) => i.autoFix?.kind === "dropEmptyTrack")).toBe(true);
    applyAutoFixes(doc, report);
    expect(doc.audio).toHaveLength(0);
  });
});

describe("runQualityChecks — التقني", () => {
  it("يكتشف مشهداً قصيراً جداً ويطبيعه", () => {
    const doc = cleanDocWithScenes(4);
    doc.scenes[1].duration = 0.5;
    const report = runQualityChecks(doc);
    const issue = report.issues.find((i) => i.autoFix?.kind === "padSceneTail" && i.sceneIndex === 1);
    expect(issue).toBeDefined();
    applyAutoFixes(doc, report);
    expect(doc.scenes[1].duration).toBeGreaterThanOrEqual(2.2);
  });

  it("يكتشف ترجمة تتجاوز نهاية الفيديو ويقصّها", () => {
    const doc = cleanDocWithScenes(4);
    const total = totalDuration(doc);
    doc.subtitles = [{ id: uid("cue"), start: total - 1, end: total + 5, text: "نهاية" }];
    const report = runQualityChecks(doc);
    expect(report.issues.some((i) => i.autoFix?.kind === "trimSubtitles")).toBe(true);
    applyAutoFixes(doc, report);
    expect(doc.subtitles[0].end).toBeLessThanOrEqual(total);
  });

  it("يكتشف مشروعاً بلا مشاهد", () => {
    const report = runQualityChecks(newDoc());
    expect(report.issues.some((i) => i.area === "technical" && i.message.includes("لا توجد مشاهد"))).toBe(true);
  });
});

describe("applyAutoFixes", () => {
  it("بلا مشاكل: لا إصلاحات ولا تعديل", () => {
    const doc = cleanDocWithScenes(4);
    const report = runQualityChecks(doc);
    const fixed = applyAutoFixes(doc, report);
    expect(fixed.applied).toHaveLength(0);
  });

  it("بعد الإصلاح الفعلي: تقرير جديد أنظف", () => {
    const doc = buildSceneFromPlanTestDoc();
    const before = runQualityChecks(doc);
    expect(before.issues.length).toBeGreaterThan(0);
    const fixed = applyAutoFixes(doc, before);
    expect(fixed.applied.length).toBeGreaterThan(0);
    const after = runQualityChecks(doc);
    expect(after.issues.filter((i) => i.autoFix?.kind === "clampSpeed" || i.autoFix?.kind === "rebalanceMusic")).toHaveLength(0);
  });
});

function buildSceneFromPlanTestDoc(): ProjectDoc {
  const directed = directProject({ idea: "فوائد شرب الماء يومياً", durationSeconds: 30 });
  const doc = buildDocFromPlan(newDoc(), directed.plan, "infographic", "educational");
  doc.voice = { mode: "piper", voice: "ar_JO-kareem-medium", speed: 2.4 };
  doc.audio = [];
  return doc;
}
