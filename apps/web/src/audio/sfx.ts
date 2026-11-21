// Free built-in sound effects and music loops, synthesized locally with WebAudio.
// Generated audio carries no third-party copyright — safe for unlimited use LY.

import { planSfxPlacements, uid, type AudioTrack } from "@msaipro/core";
import { putAsset } from "../store/storage";

interface SfxDef {
  id: string;
  nameAr: string;
  kind: "sfx" | "music";
  seconds: number;
  render: (ctx: OfflineAudioContext) => void;
}

const SFX: SfxDef[] = [
  {
    id: "whoosh",
    nameAr: "نفخة انتقال",
    kind: "sfx",
    seconds: 0.9,
    render: (ctx) => {
      const len = Math.floor(ctx.sampleRate * 0.9);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const p = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * p) * (1 - p * 0.6);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(400, 0);
      filter.frequency.exponentialRampToValueAtTime(3000, 0.45);
      filter.Q.value = 1.2;
      const gain = ctx.createGain();
      gain.gain.value = 0.8;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
    },
  },
  {
    id: "pop",
    nameAr: "بوب ظهور",
    kind: "sfx",
    seconds: 0.35,
    render: (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(180, 0);
      osc.frequency.exponentialRampToValueAtTime(90, 0.18);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.9, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(0.35);
    },
  },
  {
    id: "ding",
    nameAr: "نغمة جرس",
    kind: "sfx",
    seconds: 1.4,
    render: (ctx) => {
      [880, 1320].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(i === 0 ? 0.4 : 0.2, 0);
        gain.gain.exponentialRampToValueAtTime(0.001, 1.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(1.4);
      });
    },
  },
  {
    id: "click",
    nameAr: "نقرة",
    kind: "sfx",
    seconds: 0.12,
    render: (ctx) => {
      const len = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 400);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = 0.7;
      src.connect(gain).connect(ctx.destination);
      src.start();
    },
  },
  {
    id: "sparkle",
    nameAr: "بريق مضيء",
    kind: "sfx",
    seconds: 1.0,
    render: (ctx) => {
      [1568, 2093, 2637].forEach((f, i) => {
        const t0 = i * 0.25;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.24, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.42);
      });
    },
  },
  {
    id: "impact",
    nameAr: "صفعة إيحاء",
    kind: "sfx",
    seconds: 0.7,
    render: (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, 0);
      osc.frequency.exponentialRampToValueAtTime(38, 0.5);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.95, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(0.7);
      const len = Math.floor(ctx.sampleRate * 0.25);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 700);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "lowpass";
      hp.frequency.value = 900;
      const g2 = ctx.createGain();
      g2.gain.value = 0.5;
      src.connect(hp).connect(g2).connect(ctx.destination);
      src.start();
    },
  },
  {
    id: "riser",
    nameAr: "صاعد تشويقي",
    kind: "sfx",
    seconds: 1.6,
    render: (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, 0);
      osc.frequency.exponentialRampToValueAtTime(1400, 1.55);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, 0);
      gain.gain.exponentialRampToValueAtTime(0.4, 1.4);
      gain.gain.exponentialRampToValueAtTime(0.001, 1.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(1.6);
    },
  },
  {
    id: "music_calm",
    nameAr: "موسيقى هادئة",
    kind: "music",
    seconds: 24,
    render: (ctx) => {
      const notes = [220, 277.18, 329.63, 415.3, 329.63, 277.18, 220, 246.94];
      const step = 0.75;
      for (let n = 0; n < Math.floor(24 / step); n++) {
        const f = notes[n % notes.length];
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const gain = ctx.createGain();
        const t0 = n * step;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + step * 0.95);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + step);
      }
    },
  },
  {
    id: "music_upbeat",
    nameAr: "موسيقى حيوية",
    kind: "music",
    seconds: 20,
    render: (ctx) => {
      const line = [330, 330, 392, 330, 294, 262, 294, 330];
      for (let n = 0; n < 40; n++) {
        const f = line[n % line.length] * (n % 8 < 4 ? 1 : 1.122);
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = f;
        const gain = ctx.createGain();
        const t0 = n * 0.5;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.5);
      }
    },
  },
];

export interface LibraryItem {
  id: string;
  nameAr: string;
  kind: "sfx" | "music";
  seconds: number;
}

export function listAudioLibrary(): LibraryItem[] {
  return SFX.map(({ id, nameAr, kind, seconds }) => ({ id, nameAr, kind, seconds }));
}

/** Render a library item to a blob once and register it as an asset, returning a track. */
export async function createTrackFromLibrary(
  itemId: string,
  startAt: number,
  role: "music" | "sfx",
): Promise<AudioTrack | null> {
  const def = SFX.find((s) => s.id === itemId);
  if (!def) return null;
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(def.seconds * sampleRate), sampleRate);
  def.render(ctx);
  const rendered = await ctx.startRendering();
  const wav = encodeWav(rendered);
  const assetId = uid("sfx");
  await putAsset(assetId, new Blob([wav], { type: "audio/wav" }));
  return {
    id: uid("trk"),
    assetId,
    name: def.nameAr,
    role,
    startAt: Math.max(0, startAt),
    inPoint: 0,
    outPoint: null,
    volume: role === "music" ? 0.35 : 0.8,
    fadeIn: role === "music" ? 1.5 : 0,
    fadeOut: role === "music" ? 1.5 : 0.1,
  };
}

function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const len = buffer.length * channels * 2 + 44;
  const view = new DataView(new ArrayBuffer(len));
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, len - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, len - 44, true);
  let offset = 44;
  const chanData = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, chanData[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return view.buffer;
}

/**
 * يحسب مواضع مؤثرات الخطة (حقل sfx في meta.plan لكل مشهد) ويعيد جاهزة الإضافة:
 * - يتجاهل ما أُضيف سلفاً لنفس المشهد بالاسم نفسه.
 * - الإضافة الفعلية للمشروع تتم عند المستدعي (زر في استوديو الصوت).
 */
export async function collectPlanSfxTracks(
  plans: { sfx?: string | null }[] | undefined,
  durations: number[],
  sceneIds: string[],
  existing: AudioTrack[],
): Promise<AudioTrack[]> {
  if (!plans || !plans.length) return [];
  const placements = planSfxPlacements(plans, durations);
  const tracks: AudioTrack[] = [];
  for (const p of placements) {
    const lib = SFX.find((s) => s.id === p.sfxId);
    if (!lib) continue;
    const sceneId = sceneIds[p.sceneIndex];
    const already = existing.some((t) => t.role === "sfx" && t.name === lib.nameAr && t.sceneId === sceneId);
    if (already) continue;
    const track = await createTrackFromLibrary(p.sfxId, p.startAt, "sfx");
    if (!track) continue;
    track.sceneId = sceneId;
    tracks.push(track);
  }
  return tracks;
}
