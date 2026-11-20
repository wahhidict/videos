import { describe, expect, it } from "vitest";
import {
  EditHistory,
  applyNaturalCommand,
  buildDocFromPlan,
  directProject,
  newDoc,
  parseArabicCommand,
  totalDuration,
} from "../src/index";

function sampleDoc() {
  const directed = directProject({ idea: "فوائد شرب الماء يومياً", durationSeconds: 30 });
  return buildDocFromPlan(newDoc(), directed.plan, "infographic", "educational", "فوائد شرب الماء");
}

describe("EditHistory", () => {
  it("undo يعيد السابق وredo يعيد الحالي", () => {
    const hist = new EditHistory<number>();
    hist.push(1);
    expect(hist.canUndo()).toBe(true);
    expect(hist.undo(2)).toBe(1);
    expect(hist.canRedo()).toBe(true);
    expect(hist.redo(1)).toBe(2);
    expect(hist.canUndo()).toBe(true);
  });

  it("أمر جديد بعد undo يفرّغ الإعادة", () => {
    const hist = new EditHistory<number>();
    hist.push(1);
    hist.undo(2);
    hist.push(5);
    expect(hist.canRedo()).toBe(false);
  });

  it("حد الذاكرة يُطبق", () => {
    const hist = new EditHistory<number>(3);
    for (const v of [1, 2, 3, 4, 5]) hist.push(v);
    expect(hist.past.length).toBe(3);
  });
});

describe("parseArabicCommand + applyNaturalCommand", () => {
  it("«احذف المشهد الثاني» يحذف فعلاً ويطابق العدد", () => {
    const doc = sampleDoc();
    const before = doc.scenes.length;
    const cmd = parseArabicCommand("احذف المشهد الثاني", 0, doc.scenes.length, totalDuration(doc));
    expect(cmd.ok).toBe(true);
    expect(cmd.kind).toBe("deleteScene");
    expect(applyNaturalCommand(doc, cmd)).toBe(true);
    expect(doc.scenes.length).toBe(before - 1);
  });

  it("«احذف هذا المشهد» يستخدم المشهد الحالي", () => {
    const doc = sampleDoc();
    const before = doc.scenes.length;
    const cmd = parseArabicCommand("احذف هذا المشهد", 2, before, totalDuration(doc));
    expect(cmd.kind).toBe("deleteThisScene");
    expect(cmd.targetScene).toBe(2);
    expect(applyNaturalCommand(doc, cmd)).toBe(true);
    expect(doc.scenes.length).toBe(before - 1);
  });

  it("«غيّر لون الخلفية إلى الأزرق الداكن» يعيد لوناً حقيقياً وأمراً بلا هدف مشهد واحد", () => {
    const doc = sampleDoc();
    const cmd = parseArabicCommand("غيّر لون الخلفية إلى الأزرق الداكن", 0, doc.scenes.length, totalDuration(doc));
    expect(cmd.ok).toBe(true);
    expect(cmd.kind).toBe("backgroundColor");
    expect(cmd.hex).toBe("#10214b");
    expect(applyNaturalCommand(doc, cmd)).toBe(true);
    expect(doc.scenes.every((s) => s.background.color === "#10214b")).toBe(true);
  });

  it("«اجعل المشهد الثاني سينمائياً» يعدّل هذا المشهد فقط", () => {
    const doc = sampleDoc();
    const otherBefore = doc.scenes[1].camera.zoom;
    const cmd = parseArabicCommand("اجعل المشهد الثاني سينمائياً", 0, doc.scenes.length, totalDuration(doc));
    expect(cmd.kind).toBe("cinematicScene");
    expect(cmd.targetScene).toBe(1);
    expect(applyNaturalCommand(doc, cmd)).toBe(true);
    expect(doc.scenes[1].background.style).toBe("darkCinema");
    expect(doc.scenes[1].camera.zoom).toBeGreaterThan(otherBefore);
    expect(doc.scenes[2].background.style).not.toBe("darkCinema");
  });

  it("«اجعل التعليق الصوتي أبطأ قليلاً» يقيد السرعة بـ 0.8x-1.25x", () => {
    const doc = sampleDoc();
    doc.voice = { mode: "piper", voice: null, speed: 1.0 };
    const cmd = parseArabicCommand("اجعل التعليق الصوتي أبطأ قليلاً", 0, doc.scenes.length, totalDuration(doc));
    expect(cmd.kind).toBe("voiceSpeed");
    expect(applyNaturalCommand(doc, cmd)).toBe(true);
    expect(doc.voice.speed).toBeCloseTo(0.9, 5);
    for (let i = 0; i < 5; i += 1) applyNaturalCommand(doc, cmd);
    expect(doc.voice.speed).toBeLessThanOrEqual(1.25);
  });

  it("«اخفض الموسيقى أثناء الكلام» يخفض مسارات الموسيقى فقط", () => {
    const doc = sampleDoc();
    doc.audio = [
      {
        id: "m1",
        assetId: "a1",
        name: "موسيقى",
        role: "music",
        startAt: 0,
        inPoint: 0,
        outPoint: 10,
        volume: 0.9,
        fadeIn: 0,
        fadeOut: 0,
      },
      {
        id: "v1",
        assetId: "a2",
        name: "تعليق",
        role: "voice",
        startAt: 0,
        inPoint: 0,
        outPoint: 10,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
      },
    ];
    const cmd = parseArabicCommand("اخفض الموسيقى أثناء الكلام", 0, doc.scenes.length, totalDuration(doc));
    expect(cmd.kind).toBe("duckMusic");
    expect(applyNaturalCommand(doc, cmd)).toBe(true);
    expect(doc.audio.find((t2) => t2.id === "m1")!.volume).toBe(0.25);
    expect(doc.audio.find((t2) => t2.id === "v1")!.volume).toBe(1);
  });

  it("«اختصر الفيديو إلى دقيقة» يوصل المدة إلى 60ث ±1", () => {
    const doc = directProject({ idea: "رحلة إلى مكة 42", durationSeconds: 180 });
    const d = buildDocFromPlan(newDoc(), doc.plan, "minimal", "documentary", "رحلة إلى مكة");
    const cmd = parseArabicCommand("اختصر الفيديو إلى دقيقة", 0, d.scenes.length, totalDuration(d));
    expect(cmd.kind).toBe("shortenVideo");
    expect(cmd.newDuration).toBe(60);
    expect(cmd.destructive).toBe(true);
    expect(applyNaturalCommand(d, cmd)).toBe(true);
    expect(totalDuration(d)).toBeGreaterThanOrEqual(59);
    expect(totalDuration(d)).toBeLessThanOrEqual(61);
  });

  it("«اختصر الفيديو إلى 45 ثانية» بالأرقام اللاتينية", () => {
    const doc = sampleDoc();
    const cmd = parseArabicCommand("اختصر الفيديو إلى 45 ثانية", 0, doc.scenes.length, totalDuration(doc));
    expect(cmd.newDuration).toBe(45);
    applyNaturalCommand(doc, cmd);
    expect(totalDuration(doc)).toBeLessThanOrEqual(46);
  });

  it("«اجعل الانتقالات أكثر نعومة» يحول الانتقالات إلى fade", () => {
    const doc = sampleDoc();
    doc.scenes.forEach((s, i) => {
      s.transitionIn = i % 2 === 0 ? "none" : "zoomIn";
    });
    const cmd = parseArabicCommand("اجعل الانتقالات أكثر نعومة", 0, doc.scenes.length, totalDuration(doc));
    expect(cmd.kind).toBe("smoothTransitions");
    applyNaturalCommand(doc, cmd);
    expect(doc.scenes.filter((s) => s.transitionIn !== "fade" && s.transitionIn !== "none")).toHaveLength(0);
  });

  it("أمر غير مفهوم: بلا تعديل وبرسالة توضيحية", () => {
    const doc = sampleDoc();
    const before = JSON.stringify(doc);
    const cmd = parseArabicCommand("اركب الدراجة الهوائية الآن", 0, doc.scenes.length, totalDuration(doc));
    expect(cmd.ok).toBe(false);
    expect(applyNaturalCommand(doc, cmd)).toBe(false);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("فهرس خارج المجال يرفض بأمان", () => {
    const doc = sampleDoc();
    const cmd = parseArabicCommand("احذف المشهد التاسع", 0, doc.scenes.length, totalDuration(doc));
    expect(cmd.ok).toBe(false);
  });
});
