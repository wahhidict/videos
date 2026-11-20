import { describe, expect, it } from "vitest";
import {
  MAX_VOICE_SPEEDUP,
  PEAK_DBFS_LIMIT,
  duckGainEnvelope,
  mixTracks,
  normalizeToLimit,
  pcmPeakDbfs,
  pcmTo16,
  planSfxPlacements,
  planVoiceFit,
  sceneStartTimes,
} from "../src/audio";
import { encodeWavMono, wavDurationSeconds } from "../src/wav";

describe("planVoiceFit", () => {
  it("نص قصير في نافذة واسعة: لا تدخل", () => {
    const fit = planVoiceFit({ text: "مرحباً بالعالم", windowSeconds: 10 });
    expect(fit.action).toBe("fits");
    if (fit.action === "fits") expect(fit.speedRatio).toBe(1);
    expect(fit.text).toBe("مرحباً بالعالم");
  });

  it("أطول قليلاً من النافذة: تسريع محدود ضمن 1.25x", () => {
    const text = Array.from({ length: 34 }, () => "كلمة").join(" ");
    const fit = planVoiceFit({ text, windowSeconds: 12, wordsPerSecond: 2.3 });
    expect(fit.action).toBe("adjust");
    if (fit.action === "adjust") {
      expect(fit.speedRatio).toBeGreaterThan(1);
      expect(fit.speedRatio).toBeLessThanOrEqual(MAX_VOICE_SPEEDUP);
    }
    expect(fit.text).toBe(text);
  });

  it("نص أطول بكثير: تقصير بدلاً من تسريع غير طبيعي", () => {
    const text = "الفكرة الأولى عن وجوب شرب الماء يومياً. ثم نص ثانٍ طويل تماماً يتجاوز النافذة بكثير. وجملة ثالثة صناعية أيضاً تفوق الحد بأضعافً.";
    const fit = planVoiceFit({ text, windowSeconds: 2, wordsPerSecond: 2.3 });
    expect(fit.action).toBe("shorten");
    if (fit.action === "shorten") {
      expect(fit.speedRatio).toBeLessThanOrEqual(MAX_VOICE_SPEEDUP);
      expect(fit.removedWords).toBeGreaterThan(0);
    }
    const wordsAfter = fit.text.split(/\s+/).filter(Boolean).length;
    expect(wordsAfter).toBeLessThan(text.split(/\s+/).filter(Boolean).length);
  });
});

describe("duckGainEnvelope", () => {
  const sr = 1000;
  const total = 5000;

  it("خارج الكلام كسب 1، أثناء الكلام حوالي مستوى duck", () => {
    const g = duckGainEnvelope(total, sr, [{ start: 1.5, end: 2.5 }], { duckLevel: 0.25, attackSeconds: 0.1, releaseSeconds: 0.3 });
    expect(g[100]).toBeCloseTo(1, 3);
    expect(g[2000]).toBeLessThanOrEqual(0.27);
    expect(g[1450]).toBeGreaterThan(0.25);
    expect(g[1450]).toBeLessThan(1);
    expect(g[2700]).toBeGreaterThan(0.25);
    expect(g[2700]).toBeLessThanOrEqual(1);
  });

  it("فترتان متقاطعتان: الحد الأدنى يستقر", () => {
    const g = duckGainEnvelope(total, sr, [
      { start: 0.5, end: 1.5 },
      { start: 1.2, end: 2.0 },
    ], { duckLevel: 0.3, attackSeconds: 0.05, releaseSeconds: 0.05 });
    expect(g[1600]).toBeLessThanOrEqual(0.32);
  });
});

describe("mixTracks — ducking مدمج في الخلط", () => {
  const sr = 8000;

  function sine(seconds: number, freq: number, amplitude: number): Float32Array {
    const n = Math.floor(seconds * sr);
    const pcm = new Float32Array(n);
    for (let i = 0; i < n; i += 1) pcm[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sr);
    return pcm;
  }

  it("الموسيقى تخفض المستوى المصطناعي أثناء الكلام فقط", () => {
    const music = mixTracks(
      [{ ...{ pcm: sine(4, 220, 0.5), sampleRate: sr, startAt: 0, volume: 1, fadeIn: 0, fadeOut: 0, role: "music" as const } }],
      4,
    );
    const clean = music.pcm;

    const ducked = mixTracks(
      [
        { ...{ pcm: sine(4, 220, 0.5), sampleRate: sr, startAt: 0, volume: 1, fadeIn: 0, fadeOut: 0, role: "music" as const } },
        { ...{ pcm: sine(0.8, 500, 0.0), sampleRate: sr, startAt: 1.5, volume: 1, fadeIn: 0, fadeOut: 0, role: "voice" as const } },
      ],
      4,
    );
    const peakOf = (pcm: Float32Array, from: number, to: number) => {
      let m = 0;
      for (let i = Math.floor(from * sr); i < Math.floor(to * sr); i += 1) m = Math.max(m, Math.abs(pcm[i]));
      return m;
    };
    const cleanVoice = peakOf(clean, 1.5, 2.3);
    const duckVoice = peakOf(ducked.pcm, 1.5, 2.3);
    const cleanOpen = peakOf(clean, 3.0, 4.0);
    const duckOpen = peakOf(ducked.pcm, 3.0, 4.0);
    expect(cleanVoice).toBeGreaterThan(0.1);
    expect(duckVoice).toBeLessThan(cleanVoice * 0.25 + 1e-6);
    expect(duckOpen / cleanOpen).toBeGreaterThan(0.9);
    expect(ducked.clipped).toBe(false);
  });
});

describe("normalizeToLimit", () => {
  it("ذروة عالية تنزف إلى -1 dBFS", () => {
    const pcm = new Float32Array(1000).fill(0.9);
    const norm = normalizeToLimit(pcm, PEAK_DBFS_LIMIT);
    expect(pcmPeakDbfs(norm).peakDbfs).toBeCloseTo(PEAK_DBFS_LIMIT, 1);
  });

  it("ذروة منخفضة تبقى كما هي", () => {
    const pcm = new Float32Array(1000).fill(0.1);
    const out = normalizeToLimit(pcm, PEAK_DBFS_LIMIT);
    expect(out[500]).toBeCloseTo(0.1, 4);
  });
});

describe("الجولة إلى WAV", () => {
  it("pcmTo16 + encodeWavMono يعطيان مدة حقيقية خلال wavDurationSeconds", () => {
    const sr = 24000;
    const pcm = new Float32Array(sr * 2).fill(0.1);
    const wav = encodeWavMono(pcmTo16(pcm), sr);
    expect(wavDurationSeconds(wav)).toBeCloseTo(2.0, 1);
  });
});

describe("توزيع مؤثرات خطة LLM على المسارات", () => {
  it("sceneStartTimes يعطي اللحظات التراكمية", () => {
    expect(sceneStartTimes([5, 3, 2])).toEqual([0, 5, 8]);
  });

  it("يتجاهل none وغير المعرّف", () => {
    const placements = planSfxPlacements([{ sfx: "none" }, {}, { sfx: null }], [5, 5, 5]);
    expect(placements).toEqual([]);
  });

  it("يمنع قيمًا خارج القاموس", () => {
    const placements = planSfxPlacements([{ sfx: "explosion" }, { sfx: "bosos" }], [5, 5]);
    expect(placements).toEqual([]);
  });

  it("يوزّع المؤثر داخل بداية مشهده", () => {
    const placements = planSfxPlacements([{ sfx: "none" }, { sfx: "impact" }, { sfx: "none" }], [4, 6, 4]);
    expect(placements).toHaveLength(1);
    expect(placements[0].sceneIndex).toBe(1);
    expect(placements[0].startAt).toBeCloseTo(4.2, 5);
  });

  it("يقلّم البدء ليبقى المؤثر داخل مشهده القصير", () => {
    const placements = planSfxPlacements([{ sfx: "riser" }], [2]);
    expect(placements[0].startAt).toBeCloseTo(0.2, 5);
    expect(placements[0].startAt + 1.6).toBeLessThanOrEqual(2);
  });

  it("يمنع التكرار المتلاحق في المشاهد القصيرة ويستأنف بعد انقطاع الشرط", () => {
    const placements = planSfxPlacements([{ sfx: "pop" }, { sfx: "pop" }, { sfx: "pop" }], [2.5, 2.5, 6]);
    expect(placements).toHaveLength(2);
    expect(placements.map((p) => p.sceneIndex)).toEqual([0, 2]);
  });

  it("يسمح بالتكرار بين مشاهد أطول من 3 ثوانٍ", () => {
    const placements = planSfxPlacements([{ sfx: "whoosh" }, { sfx: "whoosh" }], [4, 4]);
    expect(placements).toHaveLength(2);
  });

  it("يحترم سقف maxPlacements", () => {
    const plans = Array.from({ length: 20 }, () => ({ sfx: "click" as string }));
    const durations = Array.from({ length: 20 }, () => 5);
    expect(planSfxPlacements(plans, durations, 4)).toHaveLength(4);
  });
});
