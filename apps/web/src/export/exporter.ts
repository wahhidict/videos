// Real local rendering pipeline.
// 1) Preferred: WebCodecs VideoEncoder + AudioEncoder muxed into a real MP4 (H.264/AAC) with mp4-muxer.
// 2) Fallback: realtime MediaRecorder (WebM) — the desktop app transcodes to MP4 with FFmpeg.
// Progress is derived from actual encoded frames — never simulated.

import type { ProjectDoc } from "@msaipro/core";
import { totalDuration } from "@msaipro/core";
import { drawFrameAt } from "@msaipro/core";
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { renderAudioMix } from "../audio/engine";

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  onProgress: (frame: number, total: number, stage: string) => void;
  onLog: (line: string) => void;
  shouldCancel: () => boolean;
}

export type ExportFormat = "mp4" | "webm";

export interface ExportResult {
  blob: Blob;
  format: ExportFormat;
  frames: number;
  seconds: number;
  audioFrames?: number;
}

export function pickFormat(): ExportFormat {
  if (typeof window === "undefined") return "webm";
  if ("VideoEncoder" in window && "VideoFrame" in window) return "mp4";
  return "webm";
}

const AVC_CANDIDATES = ["avc1.640028", "avc1.4d002a", "avc1.42e01e"];
const VP9_CANDIDATE = "vp09.00.10.08";

// AAC تعمل في المتصفحات ذات التراخيص؛ Opus هو البديل الحر (يتطلب 48kHz).
export async function pickAudioCodec(): Promise<{ codec: "mp4a.40.2" | "opus"; sampleRate: 44100 | 48000 } | null> {
  if (typeof window === "undefined" || !("AudioEncoder" in window)) return null;
  try {
    const aac = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 });
    if (aac.supported) return { codec: "mp4a.40.2", sampleRate: 44100 };
  } catch { /* try opus */ }
  try {
    const opus = await AudioEncoder.isConfigSupported({ codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 });
    if (opus.supported) return { codec: "opus", sampleRate: 48000 };
  } catch { /* none */ }
  return null;
}

async function pickVideoCodec(width: number, height: number, fps: number, bitrate: number): Promise<{ codec: string; muxerCodec: "avc" | "vp9" } | null> {
  for (const codec of AVC_CANDIDATES) {
    try {
      const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps });
      if (support.supported) return { codec, muxerCodec: "avc" };
    } catch { /* try next */ }
  }
  try {
    const support = await VideoEncoder.isConfigSupported({ codec: VP9_CANDIDATE, width, height, bitrate, framerate: fps });
    if (support.supported) return { codec: VP9_CANDIDATE, muxerCodec: "vp9" };
  } catch { /* none */ }
  return null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function exportVideo(doc: ProjectDoc, opts: ExportOptions): Promise<ExportResult> {
  const format = pickFormat();
  return format === "mp4" ? exportWebCodecs(doc, opts) : exportMediaRecorder(doc, opts);
}

async function exportWebCodecs(doc: ProjectDoc, opts: ExportOptions): Promise<ExportResult> {
  const { width, height, fps } = opts;
  const totalSec = totalDuration(doc);
  const totalFrames = Math.max(1, Math.round(totalSec * fps));
  opts.onLog(`إعداد الترميز: ${width}×${height} @ ${fps}fps — ${totalFrames} إطاراً`);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");

  const bitrate = Math.max(2_000_000, Math.round(width * height * fps * 0.09));
  const picked = await pickVideoCodec(width, height, fps, bitrate);
  if (!picked) {
    opts.onLog("لا يوجد ترميز فيديو مدعوم في هذا المتصفح — سيتم استخدام طريقة بديلة");
    return exportMediaRecorder(doc, opts);
  }
  opts.onLog(`المرمّز المختار: ${picked.codec}`);
  const target = new Mp4Target();
  const audioPick = doc.audio.length > 0 ? await pickAudioCodec() : null;
  if (doc.audio.length > 0 && !audioPick) opts.onLog("ترميز الصوت غير مدعوم في هذا المتصفح — سيصدر الفيديو صامتًا");
  const muxer = new Mp4Muxer({
    target,
    video: { codec: picked.muxerCodec, width, height },
    ...(audioPick ? { audio: { codec: audioPick.codec === "mp4a.40.2" ? "aac" : "opus", sampleRate: audioPick.sampleRate, numberOfChannels: 2 } } : {}),
    fastStart: "in-memory",
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => opts.onLog(`خطأ الترميز: ${String(e)}`),
  });
  videoEncoder.configure({
    codec: picked.codec,
    width,
    height,
    bitrate,
    framerate: fps,
  });

  let frame = 0;
  for (; frame < totalFrames; frame++) {
    if (opts.shouldCancel()) {
      try { videoEncoder.close(); } catch { /* ignore */ }
      throw new Error("cancelled");
    }
    drawFrameAt(doc, ctx, width, height, frame / fps);
    const vf = new VideoFrame(canvas, {
      timestamp: Math.round((frame * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    videoEncoder.encode(vf, { keyFrame: frame % (fps * 2) === 0 });
    vf.close();
    if (frame % 5 === 0) {
      opts.onProgress(frame + 1, totalFrames, "video");
      if (videoEncoder.encodeQueueSize > 16) await wait(4);
    }
    if (frame % 90 === 89) await wait(0);
  }
  opts.onProgress(totalFrames, totalFrames, "video");
  await videoEncoder.flush();
  videoEncoder.close();
  opts.onLog("تم ترميز الفيديو بنجاح");

  let audioFrames = 0;
  const mix = audioPick ? await renderAudioMix(doc, totalSec, audioPick.sampleRate) : null;
  if (audioPick && mix) {
    opts.onLog(`جارٍ ترميز الصوت (${audioPick.codec === "mp4a.40.2" ? "AAC" : "Opus"})...`);
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => opts.onLog(`خطأ صوت: ${String(e)}`),
    });
    try {
      audioEncoder.configure({
        codec: audioPick.codec,
        sampleRate: audioPick.sampleRate,
        numberOfChannels: 2,
        bitrate: 128_000,
      });
      const channels = Math.min(2, mix.buffer.numberOfChannels);
      const chunkFrames = 1024;
      for (let off = 0; off < mix.buffer.length; off += chunkFrames) {
        if (opts.shouldCancel()) throw new Error("cancelled");
        const n = Math.min(chunkFrames, mix.buffer.length - off);
        const data = new Float32Array(n * channels);
        for (let c = 0; c < channels; c++) {
          data.set(mix.buffer.getChannelData(c).subarray(off, off + n), c * n);
        }
        const chunk = new AudioData({
          format: "f32",
          sampleRate: audioPick.sampleRate,
          numberOfFrames: n,
          numberOfChannels: channels,
          timestamp: Math.round((off / mix.sampleRate) * 1_000_000),
          data,
        });
        audioEncoder.encode(chunk);
        audioFrames++;
        chunk.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();
      opts.onLog("تم ترميز الصوت بنجاح");
    } catch (e) {
      opts.onLog(`تعذر ترميز الصوت (سيصدر الفيديو صامتاً): ${String(e)}`);
      try { audioEncoder.close(); } catch { /* ignore */ }
    }
  }

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  return { blob, format: "mp4", frames: totalFrames, seconds: totalSec, audioFrames };
}

async function exportMediaRecorder(doc: ProjectDoc, opts: ExportOptions): Promise<ExportResult> {
  const { width, height, fps } = opts;
  const totalSec = totalDuration(doc);
  const totalFrames = Math.max(1, Math.round(totalSec * fps));
  opts.onLog("المتصفح لا يدعم WebCodecs — سيتم التصدير بـ MediaRecorder (WebM) بدقة أبطأ");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");

  const stream = canvas.captureStream(fps);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const parts: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data); };
  recorder.start(500);

  const frameDur = 1000 / fps;
  const startWall = performance.now();
  let frame = 0;
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (opts.shouldCancel()) { resolve(); return; }
      const elapsed = performance.now() - startWall;
      frame = Math.min(totalFrames - 1, Math.floor((elapsed / 1000) * fps));
      drawFrameAt(doc, ctx, width, height, frame / fps);
      opts.onProgress(frame + 1, totalFrames, "video");
      if (frame >= totalFrames - 1 && elapsed > totalSec * 1000) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  void frameDur;
  await new Promise((r) => setTimeout(r, 400));
  recorder.stop();
  await new Promise((r) => { recorder.onstop = r; });
  const blob = new Blob(parts, { type: mime });
  return { blob, format: "webm", frames: totalFrames, seconds: totalSec, audioFrames: 0 };
}

export async function transcodeToMp4OnDesktop(inputPath: string, outputPath: string, onLog: (s: string) => void): Promise<boolean> {
  const bridge = (globalThis as Record<string, unknown>).__MSAI_DESKTOP__ as
    | { transcodeToMp4?: (i: string, o: string, onLog: (s: string) => void) => Promise<boolean> }
    | undefined;
  if (!bridge?.transcodeToMp4) return false;
  return bridge.transcodeToMp4(inputPath, outputPath, onLog);
}
