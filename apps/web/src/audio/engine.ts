// WebAudio mixing engine: preview and offline mix of AudioTracks.

import type { AudioTrack, ProjectDoc } from "@msaipro/core";
import { mixTracks, normalizeToLimit, resampleLinear, type MixTrackInput } from "@msaipro/core";
import { getAsset } from "../store/storage";

let sharedCtx: AudioContext | null = null;
export function audioCtx(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  if (sharedCtx.state === "suspended") void sharedCtx.resume();
  return sharedCtx;
}

const bufferCache = new Map<string, AudioBuffer | null>();

export async function loadTrackBuffer(track: AudioTrack): Promise<AudioBuffer | null> {
  const key = `audio:${track.assetId}`;
  if (bufferCache.has(key)) return bufferCache.get(key) ?? null;
  const blob = await getAsset(track.assetId);
  if (!blob) return null;
  const arr = await blob.arrayBuffer();
  try {
    const buf = await audioCtx().decodeAudioData(arr);
    bufferCache.set(key, buf);
    return buf;
  } catch {
    bufferCache.set(key, null);
    return null;
  }
}

export function trackGainAt(track: AudioTrack, localT: number, durPlayed: number): number {
  let g = track.volume;
  if (track.fadeIn > 0 && localT < track.fadeIn) g *= localT / track.fadeIn;
  if (track.fadeOut > 0) {
    const remaining = durPlayed - localT;
    if (remaining < track.fadeOut) g *= Math.max(0, remaining / track.fadeOut);
  }
  return Math.max(0, Math.min(1, g));
}

export interface RenderedAudio {
  buffer: AudioBuffer;
  sampleRate: number;
}

function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const out = new Float32Array(buffer.length);
  const chans = buffer.numberOfChannels;
  for (let c = 0; c < chans; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) out[i] += d[i] / chans;
  }
  return out;
}

/** Offline-mix every audio track into one buffer, exactly aligned to the timeline.
 * الخلط يتم عبر دوال core المختبرة: Ducking تلقائي للموسيقى/المؤثرات خلال الكلام،
 * وتدوير الموسيقى لتغطية كامل مدة الفيديو، وسقف ذروة −1 dBFS عبر normalizeToLimit. */
const MUSIC_TARGET_RMS = 0.05;
const MUSIC_PEAK_SAFE = 0.9;

function normalizeMusicLevel(pcm: Float32Array): Float32Array {
  if (pcm.length === 0) return pcm;
  let sum = 0;
  for (let i = 0; i < pcm.length; i += 1) sum += pcm[i] * pcm[i];
  const rms = Math.sqrt(sum / pcm.length);
  if (rms < 0.0001) return pcm;
  let factor = MUSIC_TARGET_RMS / rms;
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 1) peak = Math.max(peak, Math.abs(pcm[i] * factor));
  if (peak > MUSIC_PEAK_SAFE) factor *= MUSIC_PEAK_SAFE / peak;
  if (Math.abs(factor - 1) < 0.05) return pcm;
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) out[i] = pcm[i] * factor;
  return out;
}

export async function renderAudioMix(doc: ProjectDoc, totalSec: number, sampleRate = 44100): Promise<RenderedAudio | null> {
  const active = doc.audio;
  if (!active.length || totalSec <= 0) return null;
  const inputs: MixTrackInput[] = [];
  for (const track of active) {
    const buffer = await loadTrackBuffer(track);
    if (!buffer) continue;
    const mono = toMono(buffer);
    let rate = buffer.sampleRate;
    const inS = Math.min(mono.length, Math.max(0, Math.floor(track.inPoint * rate)));
    const outS = track.outPoint != null ? Math.min(mono.length, Math.floor(track.outPoint * rate)) : mono.length;
    let pcm = mono.subarray(inS, Math.max(inS + 1, outS));
    if (rate !== sampleRate) {
      pcm = resampleLinear(pcm, rate, sampleRate);
      rate = sampleRate;
    }
    if (track.role === "music") {
      const cover = Math.max(0.05, totalSec - track.startAt);
      const need = Math.ceil(cover * rate);
      if (pcm.length >= need) {
        pcm = pcm.subarray(0, need);
      } else if (pcm.length > 1) {
        const tiled = new Float32Array(need);
        for (let i = 0; i < need; i++) tiled[i] = pcm[i % pcm.length];
        pcm = tiled;
      }
      pcm = normalizeMusicLevel(pcm);
    }
    inputs.push({
      pcm,
      sampleRate: rate,
      startAt: Math.max(0, track.startAt),
      volume: Math.max(0, Math.min(2, track.volume)),
      fadeIn: track.fadeIn,
      fadeOut: track.fadeOut,
      role: track.role,
    });
  }
  if (!inputs.length) return null;
  const { pcm: mixed } = mixTracks(inputs, totalSec);
  const norm = new Float32Array(normalizeToLimit(mixed));
  const offline = new OfflineAudioContext(2, norm.length, sampleRate);
  const srcBuf = offline.createBuffer(1, norm.length, sampleRate);
  srcBuf.copyToChannel(norm, 0);
  const src = offline.createBufferSource();
  src.buffer = srcBuf;
  const gain = offline.createGain();
  gain.gain.value = 1;
  src.connect(gain).connect(offline.destination);
  src.start(0);
  const out = await offline.startRendering();
  return { buffer: out, sampleRate };
}

/** Simple preview player for one track (used in the audio studio). */
export async function playTrackPreview(track: AudioTrack): Promise<AudioBufferSourceNode | undefined> {
  const buffer = await loadTrackBuffer(track);
  if (!buffer) return undefined;
  const ctx = audioCtx();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = track.volume;
  src.connect(gain).connect(ctx.destination);
  src.start(0, track.inPoint);
  return src;
}
