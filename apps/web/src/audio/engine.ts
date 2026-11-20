// WebAudio mixing engine: preview and offline mix of AudioTracks.

import type { AudioTrack, ProjectDoc } from "@msaipro/core";
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

/** Offline-mix every audio track into one buffer, exactly aligned to the timeline. */
export async function renderAudioMix(doc: ProjectDoc, totalSec: number): Promise<RenderedAudio | null> {
  const active = doc.audio;
  if (!active.length || totalSec <= 0) return null;
  const sampleRate = 44100;
  const length = Math.ceil(totalSec * sampleRate);
  const offline = new OfflineAudioContext(2, length, sampleRate);
  let any = false;
  for (const track of active) {
    const buffer = await loadTrackBuffer(track);
    if (!buffer) continue;
    any = true;
    const src = offline.createBufferSource();
    src.buffer = buffer;
    const gain = offline.createGain();
    const startOffset = track.inPoint;
    const sourceEnd = track.outPoint ?? buffer.duration;
    const sourceDur = Math.max(0.05, sourceEnd - startOffset);
    const motionStart = track.startAt;
    const motionEnd = motionStart + sourceDur;

    gain.gain.setValueAtTime(track.fadeIn > 0 ? 0.0001 : track.volume, motionStart);
    if (track.fadeIn > 0) gain.gain.linearRampToValueAtTime(track.volume, motionStart + track.fadeIn);
    if (track.fadeOut > 0) {
      gain.gain.setValueAtTime(track.volume, Math.max(motionStart, motionEnd - track.fadeOut));
      gain.gain.linearRampToValueAtTime(0.0001, motionEnd);
    }
    src.connect(gain).connect(offline.destination);
    src.start(Math.max(0, motionStart), startOffset, sourceDur);
  }
  if (!any) return null;
  const buffer = await offline.startRendering();
  return { buffer, sampleRate };
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
