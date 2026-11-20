// Studio صوت — خلط المسارات، Ducking، وضبط مستويات حقيقي على PCM.
// قاعدة صارمة: سقف تسريع الكلام 1.25x، والأفضلية دائماً لتقصير/توزيع النص لا للتسريع.

export const MAX_VOICE_SPEEDUP = 1.25;
export const SPEED_FLOOR = 0.8;
export const PEAK_DBFS_LIMIT = -1.0;
export const DEFAULT_DUCK_LEVEL = 0.25;

export interface VoiceFitInput {
  text: string;
  windowSeconds: number;
  wordsPerSecond?: number;
}

export type VoiceFitStrategy =
  | { action: "fits"; speedRatio: 1; text: string }
  | { action: "adjust"; speedRatio: number; text: string }
  | { action: "shorten"; speedRatio: number; text: string; removedWords: number };

/** حساب كلمات/ثانية تقريبي: العربي ≈ 2.3 كلمة/ث بصوت Piper متوسط. */
export function estimateWps(text: string): number {
  return 2.3;
}

/**
 * قرار ملاءمة التعليق في نافذة المشهد:
 * - نص قصير: يبقى كما هو (لا إضافة صمت مصطنعة هنا — الطول تديره طبقة المشهد).
 * - نص أطول قليلاً: تسريع محدود ضمن 1.25x.
 * - نص أطول بكثير: تقصير الجملة (حذف اقتراحات ثانوية) بدلاً من تسريع غير طبيعي.
 */
export function planVoiceFit(input: VoiceFitInput): VoiceFitStrategy {
  const wps = input.wordsPerSecond ?? estimateWps(input.text);
  const words = input.text.split(/\s+/).filter(Boolean);
  const naturalSeconds = words.length / wps;
  if (naturalSeconds <= 0.01) return { action: "fits", speedRatio: 1, text: input.text };
  const ratio = naturalSeconds / Math.max(0.1, input.windowSeconds);
  if (ratio <= 1) return { action: "fits", speedRatio: 1, text: input.text };
  if (ratio <= MAX_VOICE_SPEEDUP) return { action: "adjust", speedRatio: ratio, text: input.text };
  const maxWords = Math.floor(Math.max(1, input.windowSeconds * wps * MAX_VOICE_SPEEDUP));
  if (words.length <= maxWords) return { action: "adjust", speedRatio: MAX_VOICE_SPEEDUP, text: input.text };
  const kept = keepEssentialWords(words, maxWords);
  return { action: "shorten", speedRatio: MAX_VOICE_SPEEDUP, text: kept.text, removedWords: words.length - kept.text.split(/\s+/).filter(Boolean).length };
}

/** تقصير محلي: حذف جمل/شطر ثانوية أول السطر الثلاسي — دون تشويه قواعد العربية. */
function keepEssentialWords(words: string[], maxWords: number): { text: string } {
  // ارجع إلى حدود الجمل دون تغيير كلماتها
  const sentenceEnds: number[] = [];
  const full = words.join(" ");
  const matches = [...full.matchAll(/[.!؟\u061F]+/g)];
  for (const m of matches) {
    const upTo = full.slice(0, m.index! + m[0].length);
    sentenceEnds.push(upTo.split(/\s+/).length);
  }
  if (sentenceEnds.length > 1) {
    let kept = 0;
    for (const end of sentenceEnds) {
      if (end <= maxWords) kept = end;
      else break;
    }
    if (kept > 0) return { text: words.slice(0, kept).join(" ") };
  }
  let cut = maxWords;
  while (cut > 1 && words[cut - 1].match(/[،,\u060C]$/)) cut -= 1;
  return { text: words.slice(0, cut).join(" ").replace(/[،,\u060C]+$/, "") };
}

export interface DuckOptions {
  duckLevel?: number;
  attackSeconds?: number;
  releaseSeconds?: number;
}

/**
 * تغليف كسب Duck لمسيار الموسيقى مقابل فترات الكلام:
 * يعيد كسب 0..1 لكل عيّنة (يُضرب لاحقاً بحجم المسار).
 */
export function duckGainEnvelope(
  totalSamples: number,
  sampleRate: number,
  voiceSegments: { start: number; end: number }[],
  options: DuckOptions = {},
): Float32Array {
  const duckLevel = options.duckLevel ?? DEFAULT_DUCK_LEVEL;
  const attack = Math.max(0.01, options.attackSeconds ?? 0.15);
  const release = Math.max(0.05, options.releaseSeconds ?? 0.45);
  const gain = new Float32Array(totalSamples);
  gain.fill(1);
  const sorted = [...voiceSegments].sort((a, b) => a.start - b.start);
  for (const seg of sorted) {
    const s = Math.max(0, Math.floor(seg.start * sampleRate) - Math.floor(attack * sampleRate));
    const e = Math.min(totalSamples, Math.ceil(seg.end * sampleRate) + Math.floor(release * sampleRate));
    for (let i = Math.max(0, Math.floor(seg.start * sampleRate)); i < Math.min(totalSamples, Math.ceil(seg.end * sampleRate)); i += 1) {
      gain[i] = Math.min(gain[i], duckLevel);
    }
    // نعومة حواف: attack قبل الفترة
    for (let i = s; i < Math.min(Math.floor(seg.start * sampleRate), s + Math.floor(attack * sampleRate)); i += 1) {
      const t = (i - s) / Math.max(1, Math.floor(seg.start * sampleRate) - s);
      gain[i] = Math.min(gain[i], 1 - t * (1 - duckLevel));
    }
    // نعومة حواف: release بعد الفترة
    const relEnd = Math.min(totalSamples, e);
    const relStart = Math.floor(seg.end * sampleRate);
    for (let i = relStart; i < relEnd; i += 1) {
      const t = (i - relStart) / Math.max(1, relEnd - relStart);
      gain[i] = Math.min(gain[i], duckLevel + t * (1 - duckLevel));
    }
  }
  return gain;
}

export interface MixTrackInput {
  pcm: Float32Array;
  sampleRate: number;
  startAt: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  role: "voice" | "music" | "sfx";
}

export interface MixResult {
  pcm: Float32Array;
  sampleRate: number;
  peakDbfs: number;
  clipped: boolean;
}

export function pcmPeakDbfs(pcm: Float32Array): { peakDbfs: number; clipped: boolean } {
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 1) peak = Math.max(peak, Math.abs(pcm[i]));
  if (peak <= 0) return { peakDbfs: -Infinity, clipped: false };
  const dbfs = 20 * Math.log10(peak);
  return { peakDbfs: Math.round(dbfs * 10) / 10, clipped: peak > 1.0 };
}

/**
 * خلط مسارات متعددة على خط زمني واحد.
 * music/sfx تعاني ducking تلقائياً مقابل مسارات voice المتزامنة.
 */
export function mixTracks(trackInputs: MixTrackInput[], totalSeconds: number, duckOptions: DuckOptions = {}): MixResult {
  const sampleRate = trackInputs[0]?.sampleRate ?? 48000;
  const totalSamples = Math.max(1, Math.ceil(totalSeconds * sampleRate));
  const mixed = new Float32Array(totalSamples);
  const voices = trackInputs.filter((t) => t.role === "voice");
  const voiceSegments: { start: number; end: number }[] = [];
  for (const v of voices) {
    const startSec = v.startAt;
    const endSec = v.startAt + v.pcm.length / v.sampleRate;
    voiceSegments.push({ start: startSec, end: endSec });
  }
  const gain = voiceSegments.length ? duckGainEnvelope(totalSamples, sampleRate, voiceSegments, duckOptions) : null;

  for (const track of trackInputs) {
    const offset = Math.max(0, Math.floor(track.startAt * sampleRate));
    for (let i = 0; i < track.pcm.length; i += 1) {
      const out = offset + i;
      if (out >= totalSamples) break;
      let g = track.volume;
      const secondsIn = i / track.sampleRate;
      const dur = track.pcm.length / track.sampleRate;
      if (track.fadeIn > 0 && secondsIn < track.fadeIn) g *= secondsIn / track.fadeIn;
      if (track.fadeOut > 0 && secondsIn > dur - track.fadeOut) g *= Math.max(0, (dur - secondsIn) / track.fadeOut);
      if (track.role !== "voice" && gain) g *= gain[out];
      mixed[out] += track.pcm[i] * g;
    }
  }
  const { peakDbfs, clipped } = pcmPeakDbfs(mixed);
  return { pcm: mixed, sampleRate, peakDbfs, clipped };
}

/** تحديد ذروة آمنة -1 dBFS بقياس ثم قياس — لا حد صامت. */
export function normalizeToLimit(pcm: Float32Array, limitDbfs: number = PEAK_DBFS_LIMIT): Float32Array {
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 1) peak = Math.max(peak, Math.abs(pcm[i]));
  if (peak <= 0.0001) return pcm;
  const limit = Math.pow(10, limitDbfs / 20);
  if (peak <= limit) return pcm;
  const factor = limit / peak;
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) out[i] = pcm[i] * factor;
  return out;
}

/** تحويل Float PCM إلى Int16 للدفن داخلencodeWavMono. */
export function pcmTo16(pcm: Float32Array): Int16Array {
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    out[i] = Math.round(s * 32767);
  }
  return out;
}

// ———————————————————————————————
// توزيع المؤثرات الصوتية من خطة المخرج على الخط الزمني
// ———————————————————————————————

/** المؤثرات الصوتية المسنونة في قاموس المخطط — يجب أن تكون لكل واحد صوت فعلي في مكتبة الويب. */
export const PLAN_SFX_IDS = ["whoosh", "click", "pop", "sparkle", "impact", "riser"] as const;
export type PlanSfxId = (typeof PLAN_SFX_IDS)[number];

export interface SfxPlacement {
  sceneIndex: number;
  sfxId: PlanSfxId;
  /** لحظة بدء المؤثر على الخط الزمني الكلي بالثواني — داخل مشهده قدر الإمكان. */
  startAt: number;
}

/** لحظات بدء المشاهد تراكمياً من المدد. */
export function sceneStartTimes(durations: number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const d of durations) {
    out.push(acc);
    acc += Math.max(0, d);
  }
  return out;
}

/** مدة كل مؤثر مسنون بالثواني (تقريب يتقاطع مع مكتبة الويب، بحد أقصى للحجم). */
export function planSfxDuration(id: PlanSfxId): number {
  switch (id) {
    case "whoosh": return 0.9;
    case "click": return 0.12;
    case "pop": return 0.35;
    case "sparkle": return 1.0;
    case "impact": return 0.7;
    case "riser": return 1.6;
  }
}

/**
 * يحوّل حقل sfx في خطة المشاهد إلى مواضع مسارات فعلية:
 * - يتجاهل none وغير المعرّف وقيم خارج القاموس.
 * - يقدّم بدء المؤثر 0.2ث داخل المشهد، ويمنع تجاوز نهاية مشهده (يُقلَّم داخل المشهد إن أمكن).
 * - يمنع تكرار المؤثر نفسه في مشهدين متتاليين قصيرين (< 3ث) لإضعاف الرتابة.
 * - سقف عام maxPlacements حفاظاً على الوضوح الصوتي.
 */
export function planSfxPlacements(
  plans: { sfx?: string | null }[],
  durations: number[],
  maxPlacements = 10,
): SfxPlacement[] {
  const starts = sceneStartTimes(durations);
  const placements: SfxPlacement[] = [];
  let prevId: PlanSfxId | null = null;
  let prevIndex = -2;
  for (let i = 0; i < plans.length && i < durations.length; i += 1) {
    const raw = plans[i]?.sfx ?? null;
    if (!raw || raw === "none") continue;
    if (!(PLAN_SFX_IDS as readonly string[]).includes(raw)) continue;
    const id = raw as PlanSfxId;
    if (id === prevId && placements.length && i - prevIndex === 1 && durations[i] < 3) continue;
    const sceneStart = starts[i];
    const sceneDur = Math.max(0, durations[i]);
    const offset = Math.min(0.2, sceneDur * 0.1);
    const maxStart = Math.max(sceneStart, sceneStart + sceneDur - planSfxDuration(id));
    const startAt = Math.max(sceneStart + offset, Math.min(sceneStart + offset, maxStart));
    placements.push({ sceneIndex: i, sfxId: id, startAt });
    prevId = id;
    prevIndex = i;
    if (placements.length >= maxPlacements) break;
  }
  return placements;
}
