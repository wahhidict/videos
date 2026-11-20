// توليد تعليق صوتي عربي حقيقي لكل مشهد عبر Piper، قياس مدة WAV الفعلية،
// وربط كل جزء صوتي بمشهده في الـ Timeline.

import { uid, wavDurationSeconds, type AudioTrack, type ProjectDoc } from "@msaipro/core";
import { putAsset } from "../store/storage";
import { onDesktop } from "../export/desktop";

export const DEFAULT_PIPER_MODEL = "ar_JO-kareem-medium";

export type VoiceFailure = "unsupported" | "missing" | "failed";

export interface PreparedVoice {
  sceneId: string;
  sceneIndex: number;
  assetId: string;
  duration: number;
  blob: Blob;
}

export interface VoiceGeneration {
  ok: boolean;
  generated: number;
  failed: number;
  reason?: VoiceFailure;
  scenes: PreparedVoice[];
}

interface DesktopExt {
  detectTools?: () => Promise<Record<string, boolean>>;
  piperSpeak?: (text: string, model: string, lengthScale?: number) => Promise<Blob | null>;
}

export function desktopExt(): DesktopExt | null {
  if (!onDesktop()) return null;
  return ((globalThis as unknown as Record<string, unknown>).__MSAI_DESKTOP__ ?? null) as DesktopExt | null;
}

export async function piperAvailable(): Promise<boolean> {
  const ext = desktopExt();
  if (!ext?.detectTools) return false;
  try {
    const tools = await ext.detectTools();
    return tools.piper === true && tools.piperVoice === true;
  } catch {
    return false;
  }
}

/** Generate a real WAV per scene voice-over. Never fabricates success. */
export interface VoiceSceneRequest {
  id: string;
  voiceScript: string;
  plannedDuration?: number;
}

/** Fit speech inside the planned scene window: headroom reserved at both ends. */
const SPEECH_HEADROOM = 0.65;
const MAX_SPEEDUP = 2.5;

export async function generateVoiceover(
  scenes: VoiceSceneRequest[],
  opts: { model?: string; onProgress?: (done: number, total: number) => void } = {},
): Promise<VoiceGeneration> {
  const ext = desktopExt();
  if (!ext?.piperSpeak) {
    return { ok: false, generated: 0, failed: 0, reason: "unsupported", scenes: [] };
  }
  let tools: Record<string, boolean> = {};
  try {
    tools = (await ext.detectTools?.()) ?? {};
  } catch {
    tools = {};
  }
  if (!tools.piper || !tools.piperVoice) {
    return { ok: false, generated: 0, failed: 0, reason: "missing", scenes: [] };
  }
  const model = opts.model?.trim() || DEFAULT_PIPER_MODEL;
  const piper = ext.piperSpeak;
  const speakOnce = async (text: string, lengthScale?: number): Promise<{ blob: Blob | null; dur: number }> => {
    const blob = (await piper?.(text, model, lengthScale)) ?? null;
    if (!blob || blob.size < 128) return { blob: null, dur: 0 };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { blob, dur: wavDurationSeconds(bytes) ?? 0 };
  };
  const prepared: PreparedVoice[] = [];
  let failed = 0;
  const todo = scenes.filter((s) => s.voiceScript.trim().length > 1);
  let done = 0;
  for (const scene of todo) {
    try {
      const first = await speakOnce(scene.voiceScript);
      let blob = first.blob;
      let dur = first.dur;
      if (!blob || !dur || dur < 0.2) {
        failed += 1;
        done += 1;
        opts.onProgress?.(done, todo.length);
        continue;
      }
      const planned = scene.plannedDuration ?? 0;
      if (planned > 0) {
        const window = Math.max(1.6, planned - SPEECH_HEADROOM);
        if (dur > window + 0.05) {
          const speedup = Math.min(MAX_SPEEDUP, Math.max(1.0, (dur + 0.15) / window));
          const fast = await speakOnce(scene.voiceScript, 1 / speedup);
          if (fast.blob && fast.dur > 0.2 && fast.dur < dur) {
            blob = fast.blob;
            dur = fast.dur;
          }
        }
      }
      const assetId = uid("voice");
      await putAsset(assetId, blob);
      prepared.push({ sceneId: scene.id, sceneIndex: -1, assetId, duration: dur, blob });
    } catch {
      failed += 1;
    }
    done += 1;
    opts.onProgress?.(done, todo.length);
  }

  return {
    ok: prepared.length > 0,
    generated: prepared.length,
    failed,
    reason: prepared.length === 0 ? (failed > 0 ? "failed" : "missing") : failed > 0 ? "failed" : undefined,
    scenes: prepared,
  };
}

function sceneStart(doc: ProjectDoc, sceneId: string): number {
  let t = 0;
  for (const s of doc.scenes) {
    if (s.id === sceneId) return t;
    t += s.duration;
  }
  return t;
}

function voiceTrackFor(
  prepared: PreparedVoice,
  doc: ProjectDoc,
  index: number,
): AudioTrack | null {
  const scene = doc.scenes.find((s) => s.id === prepared.sceneId);
  if (!scene) return null;
  return {
    id: uid("trk"),
    assetId: prepared.assetId,
    name: `تعليق صوتي — مشهد ${index + 1}`,
    role: "voice",
    startAt: sceneStart(doc, prepared.sceneId),
    inPoint: 0,
    outPoint: prepared.duration,
    volume: 0.95,
    fadeIn: 0,
    fadeOut: 0.15,
    sceneId: prepared.sceneId,
  };
}

const SCENE_TAIL = 0.3;

/** Apply prepared voices onto a doc draft: tracks, sync, and honest scene durations. */
export function applyVoiceover(doc: ProjectDoc, generation: VoiceGeneration, replace: "all" | "matched" = "all"): void {
  if (!generation.scenes.length) return;
  const affected = new Set(generation.scenes.map((p) => p.sceneId));
  doc.audio = doc.audio.filter(
    (tr) => tr.role !== "voice" || (replace === "matched" ? !tr.sceneId || !affected.has(tr.sceneId) : false),
  );
  const indexed = new Map(generation.scenes.map((p) => [p.sceneId, p]));
  doc.scenes.forEach((scene, i) => {
    const prepared = indexed.get(scene.id);
    if (!prepared) return;
    const voiceSec = prepared.duration + SCENE_TAIL;
    if (voiceSec > scene.duration) {
      scene.duration = Math.round(voiceSec * 10) / 10;
    }
    const track = voiceTrackFor(prepared, doc, i);
    if (track) doc.audio.push(track);
  });
  doc.voice.mode = doc.voice.mode === "none" ? "piper" : doc.voice.mode;
  doc.updatedAt = new Date().toISOString();
  // Re-sync all voice track start points after duration changes.
  resyncVoiceTracks(doc);
}

/** Keep every voice track pinned to the start of its scene. */
export function resyncVoiceTracks(doc: ProjectDoc): void {
  const starts = new Map<string, number>();
  let t = 0;
  for (const s of doc.scenes) {
    starts.set(s.id, t);
    t += s.duration;
  }
  for (const track of doc.audio) {
    if (track.role === "voice" && track.sceneId && starts.has(track.sceneId)) {
      track.startAt = starts.get(track.sceneId) as number;
    }
  }
}

/** Remove voice tracks (and their assets) — used before a fresh generation. */
export async function clearVoiceTracks(doc: ProjectDoc): Promise<void> {
  const { deleteAsset } = await import("../store/storage");
  for (const track of doc.audio) {
    if (track.role === "voice") void deleteAsset(track.assetId).catch(() => undefined);
  }
  doc.audio = doc.audio.filter((tr) => tr.role !== "voice");
}
