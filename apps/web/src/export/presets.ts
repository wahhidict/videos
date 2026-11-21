// إعدادات التصدير: نسب الأبعاد والدقات و bitrate — حسابات خالصة قابلة للاختبار.

export type AspectId = "16:9" | "9:16" | "1:1" | "4:5";

export type ResolutionId = "720p" | "1080p" | "1440p" | "2160p";

export type ExportCodecPreference = "h264" | "h265";

export interface ExportSettings {
  width: number; // حتى الأبعاد (متطلب muxers/termizers)
  height: number;
  fps: number;
  bitrate: number;
  aspect: AspectId;
  resolution: ResolutionId;
  audioBitrate: number;
}

export const ASPECT_RATIOS: Record<AspectId, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
  "4:5": 4 / 5,
};

const ASPECT_AR: Record<AspectId, string> = {
  "16:9": "أفقي 16:9",
  "9:16": "عمودي 9:16",
  "1:1": "مربع 1:1",
  "4:5": "عمودي 4:5",
};

export function aspectLabelAr(aspect: AspectId): string {
  return ASPECT_AR[aspect];
}

/** أدق دقة زوجية تحافظ على النسبة: الارتفاع قاعدي، العرض مستخرج من نسبة الأبعاد. */
function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

export function buildExportSettings(input: {
  aspect: AspectId;
  resolution: ResolutionId;
  fps: number;
  bitrateScale?: number;
}): ExportSettings {
  const ratio = ASPECT_RATIOS[input.aspect];
  const heights: Record<ResolutionId, number> = { "720p": 720, "1080p": 1080, "1440p": 1440, "2160p": 2160 };
  const height = even(heights[input.resolution]);
  const width = even(height * ratio);
  // bitrate قاعدي بهامش بصري جيد لـ H.264 — يتقاسم تلقائياً مع مجموع البكسلات.
  const base = Math.max(2_000_000, Math.round(width * height * input.fps * 0.09));
  const bitrate = Math.round(base * (input.bitrateScale ?? 1));
  return {
    width,
    height,
    fps: input.fps,
    bitrate,
    aspect: input.aspect,
    resolution: input.resolution,
    audioBitrate: 128_000,
  };
}

/** ترشيح الدقات بحسب أقصى قدرة معلنة للجهاز (بلا افتراض). */
export function supportedResolutions(maxWidth: number, maxHeight: number): ResolutionId[] {
  const all: ResolutionId[] = ["720p", "1080p", "1440p", "2160p"];
  const dims = (r: ResolutionId) => buildExportSettings({ aspect: "16:9", resolution: r, fps: 30 });
  return all.filter((r) => {
    const s = dims(r);
    return s.width <= maxWidth && s.height <= maxHeight;
  });
}

export const VIDEO_CODEC_CANDIDATES = {
  h264: ["avc1.640028", "avc1.4d002a", "avc1.42e01e"],
  h265: ["hvc1.1.6.L123.00", "hev1.1.6.L123.00"],
  vp9: ["vp09.00.10.08"],
} as const;

/** فحص ناتج التصدير: أبعاد/مدة/إطارات صامتة بلا رندر مزعوم. */
export interface ExportVerification {
  ok: boolean;
  problems: string[];
}

export function verifyExportResult(input: {
  blob: { size: number };
  frames: number;
  seconds: number;
  fps: number;
  width: number;
  height: number;
  settings: { width: number; height: number };
  hasAudioExpected: boolean;
  audioFrames?: number;
}): ExportVerification {
  const problems: string[] = [];
  if (input.blob.size <= 1000) problems.push("حجم الملف صفر تقريباً — التصدير غير مكتمل");
  const expectedFrames = Math.max(1, Math.round(input.seconds * input.fps));
  if (input.frames < expectedFrames * 0.97) {
    problems.push(`الإطارات المرمّزة ${input.frames} أقل من المتوقع ${expectedFrames}`);
  }
  if (input.width !== input.settings.width || input.height !== input.settings.height) {
    problems.push(`أبعاد الناتج ${input.width}×${input.height} لا تطابق الإعدادات ${input.settings.width}×${input.settings.height}`);
  }
  if (input.hasAudioExpected && (input.audioFrames ?? 0) === 0) {
    problems.push("المشروع يحتوي مسارات صوتية لكن الناتج بلا إطارات صوت مسرّعة");
  }
  return { ok: problems.length === 0, problems };
}
