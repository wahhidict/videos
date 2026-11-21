import { useCallback, useEffect, useRef } from "react";
import type { Layer } from "@msaipro/core";
import { drawFrameAt, locateScene, totalDuration } from "@msaipro/core";
import { useApp } from "../store/appState";
import { audioCtx, loadTrackBuffer } from "../audio/engine";
import { formatTime } from "@msaipro/core";

/**
 * live preview canvas: real rendering through drawFrameAt, playback with rAF,
 * click/drag to select and move layers.
 */
export function PreviewPlayer() {
  const { doc, lang, playing, setPlaying, playhead, setPlayhead, selectedLayerId, setSelectedLayerId, updateDoc, sceneIndex } = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const lastTs = useRef<number>(0);
  const audioSources = useRef<AudioBufferSourceNode[]>([]);
  const stateRef = useRef({ doc, playing, playhead });
  stateRef.current = { doc, playing, playhead };
  const selRef = useRef({ selectedLayerId, sceneIndex });
  selRef.current = { selectedLayerId, sceneIndex };

  const total = doc ? totalDuration(doc) : 0;

  const stopAudio = useCallback(() => {
    for (const src of audioSources.current) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    audioSources.current = [];
  }, []);

  const scheduleAudio = useCallback((fromT: number) => {
    const d = stateRef.current.doc;
    if (!d) return;
    stopAudio();
    const ctx = audioCtx();
    const now = ctx.currentTime + 0.05;
    for (const track of d.audio) {
      void (async () => {
        const buffer = await loadTrackBuffer(track);
        if (!buffer) return;
        const endsAt = track.startAt + (track.outPoint ?? buffer.duration) - track.inPoint;
        if (endsAt <= fromT) return;
        const startOffsetInTrack = Math.max(0, fromT - track.startAt);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = track.volume;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(now, track.inPoint + startOffsetInTrack, Math.max(0.05, endsAt - fromT));
        audioSources.current.push(src);
      })();
    }
  }, [stopAudio]);

  // render current frame whenever doc/playhead change (paused scrubbing)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !doc) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = doc.canvas.width;
    canvas.height = doc.canvas.height;
    drawFrameAt(doc, ctx, canvas.width, canvas.height, playhead, { onImageLoad: () => drawOnce() });
    function drawOnce() {
      const d = stateRef.current.doc;
      if (!d || !ctx || !canvas) return;
      drawFrameAt(d, ctx, canvas.width, canvas.height, stateRef.current.playhead);
    }
  }, [doc, playhead, total]);

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    if (total <= 0) return;
    let ph = stateRef.current.playhead >= total ? 0 : stateRef.current.playhead;
    if (ph === 0) setPlayhead(0);
    scheduleAudio(ph);
    lastTs.current = performance.now();
    let lastPh = ph;
    const tick = (ts: number) => {
      const dt = (ts - lastTs.current) / 1000;
      lastTs.current = ts;
      ph += dt;
      if (ph >= total) {
        setPlayhead(total - 0.001);
        setPlaying(false);
        return;
      }
      setPlayhead(ph);
      const d = stateRef.current.doc;
      const canvas = canvasRef.current;
      if (d && canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) drawFrameAt(d, ctx, canvas.width, canvas.height, ph);
      }
      lastPh = ph;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      void lastPh;
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total]);

  const togglePlay = () => {
    if (!doc || !doc.scenes.length) return;
    setPlaying(!playing);
  };

  // hit-test + drag
  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { px: (e.clientX - rect.left) / rect.width, py: (e.clientY - rect.top) / rect.height };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = stateRef.current.doc;
    if (!d) return;
    const { px, py } = pointerPos(e);
    const loc = locateScene(d, stateRef.current.playhead);
    if (!loc) return;
    let hit: Layer | null = null;
    for (let i = loc.scene.layers.length - 1; i >= 0; i--) {
      const l = loc.scene.layers[i];
      const hEstimate = l.kind === "text" ? 0.06 + (l.font.size * 1.5 * loc.scene.layers.length) / d.canvas.height : l.w * 0.5625;
      const boxH = l.kind === "text" ? hEstimate : l.w * 0.31;
      const top = l.y;
      if (px >= l.x - 0.02 && px <= l.x + l.w + 0.02 && py >= top - 0.02 && py <= top + Math.max(0.06, boxH) + 0.02) {
        hit = l;
        break;
      }
    }
    if (!hit) {
      setSelectedLayerId(null);
      return;
    }
    setSelectedLayerId(hit.id);
    const startX = px - hit.x;
    const startY = py - hit.y;
    const onMove = (ev: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nx = Math.max(-0.2, Math.min(1.05, (ev.clientX - rect.left) / rect.width - startX));
      const ny = Math.max(-0.1, Math.min(1.05, (ev.clientY - rect.top) / rect.height - startY));
      const idx = selRef.current.sceneIndex;
      updateDoc((draft) => {
        const target = draft.scenes[idx]?.layers.find((l) => l.id === hit!.id);
        if (target) {
          target.x = nx;
          target.y = ny;
        }
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <>
      <div className="canvas-stage" style={{ direction: "ltr" }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          style={{ cursor: selectedLayerId ? "move" : "pointer" }}
        />
      </div>
      <div className="playbar">
        <button className="btn primary" onClick={togglePlay}>
          {playing ? "⏸ إيقاف مؤقت" : "▶ تشغيل"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0.1, total)}
          step={0.033}
          value={Math.min(playhead, total)}
          onChange={(e) => setPlayhead(Number(e.target.value))}
        />
        <span className="timecode" dir="ltr">
          {formatTime(playhead)} / {formatTime(total)}
        </span>
      </div>
      <small className="muted">{lang === "ar" ? "انقر على أي عنصر في المعاينة لتحديده وسحبه" : "Click any element in the preview to select and drag it"}</small>
    </>
  );
}
