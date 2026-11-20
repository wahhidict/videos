import { describe, expect, it } from "vitest";
import {
  autoSubtitles,
  buildDocFromScript,
  chunkText,
  easeOutCubic,
  evalCamera,
  evalTransform,
  fromSRT,
  generateArabicScript,
  MOTION_PRESETS,
  newDoc,
  duplicateScene,
  deleteScene,
  moveScene,
  setSceneDuration,
  parseProject,
  serializeProject,
  toSRT,
  totalDuration,
  cueAt,
  activeWordIndex,
  TEMPLATES,
  instantiateTemplate,
  locateScene,
} from "@msaipro/core";

describe("easing", () => {
  it("clamps progress", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(5)).toBe(1);
  });
});

describe("motion presets", () => {
  it("has unique ids and Arabic names", () => {
    const ids = MOTION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of MOTION_PRESETS) expect(p.nameAr.length).toBeGreaterThan(0);
  });

  it("presets keep transforms in valid range", () => {
    for (const preset of MOTION_PRESETS) {
      for (const t of [-1, 0, 0.3, 1.2, 5]) {
        const tf = evalTransform(
          {
            id: "l",
            kind: "text",
            name: "نص",
            x: 0.1,
            y: 0.3,
            w: 0.5,
            opacity: 1,
            startAt: 0,
            anim: preset.id,
            animDuration: 0.8,
            animDelay: 0,
            rot: 0,
            text: "نص",
            font: { family: "Cairo", size: 80, weight: 700, color: "#fff" },
            align: "center",
            lineHeight: 1.4,
          },
          t,
          1920,
          1080,
        );
        expect(tf.alpha).toBeGreaterThanOrEqual(0);
        expect(tf.alpha).toBeLessThanOrEqual(1);
        expect(Number.isFinite(tf.scale)).toBe(true);
        expect(tf.scale).toBeGreaterThan(0);
      }
    }
  });
});

describe("offline Arabic script generation", () => {
  it("generates Arabic lines for all video types", () => {
    for (const type of ["educational", "documentary", "story", "ad", "motion", "youtube", "reels", "finance", "trading"] as const) {
      const gen = generateArabicScript("الذكاء الاصطناعي", type, 60);
      expect(gen.lines.length).toBeGreaterThanOrEqual(3);
      for (const line of gen.lines) expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it("scales scene count with target duration", () => {
    const short = generateArabicScript("التداول", "trading", 30);
    const long = generateArabicScript("التداول", "trading", 600);
    expect(long.lines.length).toBeGreaterThanOrEqual(short.lines.length);
  });
});

describe("scene builder", () => {
  it("builds scenes with layers from script", () => {
    const doc = newDoc();
    buildDocFromScript(doc, ["مشهد أول", "مشهد ثانٍ", "مشهد ثالث"], "professional", "youtube");
    expect(doc.scenes.length).toBe(3);
    for (const scene of doc.scenes) {
      expect(scene.layers.length).toBeGreaterThan(0);
      expect(scene.duration).toBeGreaterThan(0);
      expect(scene.voiceScript).toBeTruthy();
    }
    expect(totalDuration(doc)).toBeGreaterThan(0);
  });

  it("builds vertical canvas for reels", () => {
    const doc = newDoc();
    buildDocFromScript(doc, ["أ", "ب"], "tech", "reels");
    expect(doc.canvas.height).toBeGreaterThan(doc.canvas.width);
  });
});

describe("document ops", () => {
  it("duplicates, deletes and moves scenes safely", () => {
    const doc = newDoc();
    buildDocFromScript(doc, ["١", "٢", "٣"], "minimal", "youtube");
    duplicateScene(doc, 0);
    expect(doc.scenes.length).toBe(4);
    moveScene(doc, 1, 0);
    expect(doc.scenes[0].title).toContain("نسخة");
    deleteScene(doc, 1);
    expect(doc.scenes.length).toBe(3);
  });

  it("clamps duration", () => {
    const doc = newDoc();
    buildDocFromScript(doc, ["١"], "minimal", "youtube");
    setSceneDuration(doc, 0, -5);
    expect(doc.scenes[0].duration).toBeGreaterThanOrEqual(0.5);
  });

  it("refuses to delete the last scene", () => {
    const doc = newDoc();
    buildDocFromScript(doc, ["١"], "minimal", "youtube");
    deleteScene(doc, 0);
    expect(doc.scenes.length).toBe(1);
  });
});

describe("project persistence", () => {
  it("round-trips serialize/parse", () => {
    const doc = newDoc();
    buildDocFromScript(doc, ["مشهد"], "professional", "youtube");
    doc.subtitles = autoSubtitles(doc);
    const json = serializeProject(doc);
    const { doc: parsed, errorAr } = parseProject(json);
    expect(errorAr).toBeNull();
    expect(parsed?.scenes.length).toBe(1);
    expect(parsed?.subtitles.length).toBeGreaterThan(0);
  });

  it("rejects invalid files", () => {
    expect(parseProject("not json").errorAr).toMatch(/مشروع|تنسيق/);
    expect(parseProject('{"id":1,"name":"x"}').errorAr).toMatch(/مشروع/);
  });
});

describe("subtitles", () => {
  it("chunks long Arabic text", () => {
    const chunks = chunkText(
      "هذا نص طويل نسبياً يحتوي على كلمات عربية كثيرة يجب تقسيمه إلى مقاطع قصيرة مناسبة للمشاهدة",
      30,
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(35);
  });

  it("imports SRT then exports identical timing", () => {
    const doc = newDoc();
    buildDocFromScript(doc, ["مشهد واحد"], "professional", "youtube");
    doc.subtitles = autoSubtitles(doc);
    const srt = toSRT(doc.subtitles);
    const cues = fromSRT(srt);
    expect(cues.length).toBe(doc.subtitles.length);
    expect(Math.abs(cues[0].start - doc.subtitles[0].start)).toBeLessThan(0.002);
    expect(cues[0].text).toBe(doc.subtitles[0].text);
  });

  it("finds active cue and word index", () => {
    const doc = newDoc();
    buildDocFromScript(doc, ["نص عربي للاختبار هنا"], "professional", "youtube");
    doc.subtitles = autoSubtitles(doc);
    const cue = doc.subtitles[0];
    const found = cueAt(doc.subtitles, cue.start + 0.1);
    expect(found?.id).toBe(cue.id);
    expect(activeWordIndex(cue, cue.end - 0.01)).toBeLessThan(
      Math.max(2, cue.text.split(" ").length),
    );
  });
});

describe("templates", () => {
  it("creates editable projects offline", () => {
    for (const t of TEMPLATES) {
      const doc = instantiateTemplate(t.id);
      expect(doc).not.toBeNull();
      expect(doc!.scenes.length).toBeGreaterThan(2);
      expect(doc!.scenes.every((s) => s.layers.length > 0)).toBe(true);
    }
  });
});

describe("timeline resolution", () => {
  it("locates scenes by time", () => {
    const doc = newDoc();
    buildDocFromScript(doc, ["أ", "ب", "ج"], "professional", "youtube");
    doc.scenes[0].duration = 5;
    doc.scenes[1].duration = 4;
    doc.scenes[2].duration = 3;
    expect(locateScene(doc, 0)?.scene.id).toBe(doc.scenes[0].id);
    expect(locateScene(doc, 7)?.scene.id).toBe(doc.scenes[1].id);
    expect(locateScene(doc, 11)?.scene.id).toBe(doc.scenes[2].id);
    expect(totalDuration(doc)).toBe(12);
  });

  it("evaluates camera zoom progressively", () => {
    const doc = newDoc();
    buildDocFromScript(doc, ["أ"], "professional", "youtube");
    doc.scenes[0].camera = { zoom: 1.4, panX: 0.3, panY: 0 };
    const early = evalCamera(doc.scenes[0], 0.01);
    const late = evalCamera(doc.scenes[0], doc.scenes[0].duration);
    expect(early.zoom).toBeLessThan(late.zoom);
    expect(late.zoom).toBeCloseTo(1.4, 1);
  });
});
