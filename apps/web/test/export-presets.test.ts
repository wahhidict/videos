import { describe, expect, it } from "vitest";
import {
  ASPECT_RATIOS,
  VIDEO_CODEC_CANDIDATES,
  buildExportSettings,
  supportedResolutions,
  verifyExportResult,
} from "../src/export/presets";

describe("buildExportSettings", () => {
  it("16:9 1080p يعطي 1920×1080", () => {
    const s = buildExportSettings({ aspect: "16:9", resolution: "1080p", fps: 30 });
    expect([s.width, s.height]).toEqual([1920, 1080]);
  });

  it("أربعة نسب أبعاد مدعومة بأبعاد زوجية", () => {
    for (const aspect of Object.keys(ASPECT_RATIOS) as (keyof typeof ASPECT_RATIOS)[]) {
      for (const resolution of ["720p", "1080p", "1440p", "2160p"] as const) {
        const s = buildExportSettings({ aspect, resolution, fps: 30 });
        expect(s.width % 2).toBe(0);
        expect(s.height % 2).toBe(0);
        expect(s.width / s.height).toBeCloseTo(ASPECT_RATIOS[aspect], 1);
      }
    }
  });

  it("أربعة دقات حتى 4K", () => {
    const heights = ["720p", "1080p", "1440p", "2160p"] as const;
    for (const r of heights) {
      const s = buildExportSettings({ aspect: "16:9", resolution: r, fps: 30 });
      expect(s.height).toBe(Number(r.replace("p", "")));
    }
    const uhd = buildExportSettings({ aspect: "16:9", resolution: "2160p", fps: 30 });
    expect([uhd.width, uhd.height]).toEqual([3840, 2160]);
  });

  it("أربعة fps خيارات وتدرجات bitrate", () => {
    for (const fps of [24, 25, 30, 60]) {
      const s = buildExportSettings({ aspect: "16:9", resolution: "1080p", fps });
      expect(s.fps).toBe(fps);
    }
    const low = buildExportSettings({ aspect: "16:9", resolution: "720p", fps: 24 });
    const high = buildExportSettings({ aspect: "16:9", resolution: "2160p", fps: 60 });
    expect(high.bitrate).toBeGreaterThan(low.bitrate * 10);
    const scaled = buildExportSettings({ aspect: "16:9", resolution: "1080p", fps: 30, bitrateScale: 2 });
    const base = buildExportSettings({ aspect: "16:9", resolution: "1080p", fps: 30 });
    expect(scaled.bitrate).toBe(base.bitrate * 2);
  });
});

describe("supportedResolutions", () => {
  it("جهاز محدود 1280px لا يعرض 1440p/4K", () => {
    const list = supportedResolutions(1280, 720);
    expect(list).toEqual(["720p"]);
  });
  it("جهاز قوي يعرض الكل", () => {
    expect(supportedResolutions(3840, 2160)).toHaveLength(4);
  });
});

describe("VIDEO_CODEC_CANDIDATES", () => {
  it("H.264 وH.265 وVP9 كلها بقائمة احتياطية", () => {
    expect(VIDEO_CODEC_CANDIDATES.h264.length).toBeGreaterThanOrEqual(3);
    expect(VIDEO_CODEC_CANDIDATES.h265).toContain("hvc1.1.6.L123.00");
    expect(VIDEO_CODEC_CANDIDATES.vp9.length).toBeGreaterThan(0);
  });
});

describe("verifyExportResult", () => {
  const base = {
    blob: { size: 1_000_000 },
    frames: 300,
    seconds: 10,
    fps: 30,
    width: 1920,
    height: 1080,
    settings: { width: 1920, height: 1080 },
    hasAudioExpected: false,
  };

  it("ناتج سليم يمر", () => {
    expect(verifyExportResult(base)).toEqual({ ok: true, problems: [] });
  });

  it("ملف فارغ يرصد", () => {
    const v = verifyExportResult({ ...base, blob: { size: 100 } });
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => p.includes("غير مكتمل"))).toBe(true);
  });

  it("إطارات ناقصة تُرصد", () => {
    const v = verifyExportResult({ ...base, frames: 100 });
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => p.includes("أقل من المتوقع"))).toBe(true);
  });

  it("أبعاد مخالفة تُرصد", () => {
    const v = verifyExportResult({ ...base, width: 1280, height: 720 });
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => p.includes("لا تطابق"))).toBe(true);
  });

  it("صوت مطلوب ومفقود تُرصد", () => {
    const v = verifyExportResult({ ...base, hasAudioExpected: true, audioFrames: 0 });
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => p.includes("إطارات صوت"))).toBe(true);
  });
});
