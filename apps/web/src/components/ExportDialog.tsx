// حوار التصدير: ينتج ملف MP4 حقيقي عبر WebCodecs (أو WebM عند غياب الدعم)،
// مع شريط تقدم من الإطارات المرمّزة فعلياً وإلغاء وإعادة محاولة وسجل عربي.

import { useRef, useState } from "react";
import { totalDuration } from "@msaipro/core";
import { useApp } from "../store/appState";
import { Modal } from "./Modal";
import { exportVideo, pickFormat, type ExportFormat } from "../export/exporter";
import { saveBlobAsFile } from "../export/desktop";
import { toSRT } from "@msaipro/core";

interface Preset {
  width: number;
  height: number;
  label: string;
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { doc, showToast, t, isDesktop } = useApp();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ frame: 0, total: 1, stage: "" });
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<{ url: string; name: string; size: number; format: ExportFormat } | null>(null);
  const cancelled = useRef(false);
  if (!doc) return null;

  const vertical = doc.canvas.height > doc.canvas.width;
  const presets: Preset[] = vertical
    ? [
        { width: 720, height: 1280, label: "HD 720p" },
        { width: 1080, height: 1920, label: "FHD 1080p" },
        { width: 1440, height: 2560, label: "QHD 1440p" },
      ]
    : [
        { width: 1280, height: 720, label: "HD 720p" },
        { width: 1920, height: 1080, label: "FHD 1080p" },
        { width: 2560, height: 1440, label: "QHD 1440p" },
        { width: 3840, height: 2160, label: "4K UHD" },
      ];
  const [res, setRes] = useState<Preset>(presets[Math.min(1, presets.length - 1)]);
  const fpsOptions = [24, 25, 30, 60] as const;
  const [fps, setFps] = useState<number>(doc.canvas.fps);
  const [ext, setExt] = useState<"mp4" | "webm">(pickFormat() === "mp4" ? "mp4" : "webm");

  const log = (line: string) => setLogs((prev) => [...prev.slice(-200), line]);

  const run = async () => {
    if (!doc) return;
    cancelled.current = false;
    setBusy(true);
    setResult(null);
    setLogs([]);
    log("بدء التصدير محلياً — لن يتم رفع أي شيء إلى الإنترنت");
    try {
      const out = await exportVideo(doc, {
        width: res.width,
        height: res.height,
        fps,
        onProgress: (frame, total, stage) => setProgress({ frame, total, stage }),
        onLog: log,
        shouldCancel: () => cancelled.current,
      });
      log(`تم الإنتاج: ${out.format.toUpperCase()} — ${out.frames} إطاراً — ${(out.blob.size / 1_048_576).toFixed(1)} م.ب`);
      const name = `${doc.name.replace(/[\\/:*?"<>|]/g, "_")}.${out.format}`;
      const url = URL.createObjectURL(out.blob);
      setResult({ url, name, size: out.blob.size, format: out.format });
      void saveBlobAsFile(name, out.blob);
      showToast(t("exportDone"));
      log(`تم تنزيل الملف تلقائياً: ${name}${isDesktop ? "" : " (أو اختر مجلد الحفظ من متصفحك)"}`);
    } catch (e) {
      if (String(e).includes("cancelled")) {
        log("تم إلغاء التصدير بواسطة المستخدم");
        showToast("تم إلغاء التصدير");
      } else {
        log(`خطأ: ${String(e)}`);
        showToast(t("exportFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const pct = Math.min(100, Math.round((progress.frame / Math.max(1, progress.total)) * 100));

  return (
    <Modal title={t("export")} onClose={onClose} wide>
      <div className="row" style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13.5, color: "var(--muted)" }}>{t("resolution")}
          <select value={res.label} onChange={(e) => setRes(presets.find((p) => p.label === e.target.value) ?? presets[0])} style={{ width: 160 }}>
            {presets.map((p) => <option key={p.label} value={p.label}>{p.label} — {p.width}×{p.height}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13.5, color: "var(--muted)" }}>{t("fps")}
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))} style={{ width: 90 }}>
            {fpsOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <span className="muted" style={{ fontSize: 13 }}>
          المدة: {formatTimeSec(totalDuration(doc))} — الصيغة: {ext.toUpperCase()}
          {ext === "webm" ? " (ستُخرج نسخة سطح المكتب MP4 عبر ترميز محلي)" : ""}
        </span>
      </div>

      <p className="muted" style={{ fontSize: 13.5 }}>{t("qualityNote")}</p>

      <div className="wizard-footer">
        {!busy && <button className="btn gold" onClick={() => void run()}>🎬 {t("export")}</button>}
        {busy && <button className="btn danger" onClick={() => { cancelled.current = true; }}>{t("cancelRender")}</button>}
        {!busy && result && <button className="btn primary" onClick={() => void run()}>{t("retry")}</button>}
        {result && <a className="btn" href={result.url} download={result.name}>⤓ {t("saveAsFile")} ({(result.size / 1_048_576).toFixed(1)} م.ب)</a>}
        {doc.subtitles.length > 0 && (
          <button className="btn" onClick={() => saveBlobAsFile(`${doc.name}.srt`, new Blob([toSRT(doc.subtitles)], { type: "text/plain;charset=utf-8" }))}>⤓ {t("exportSrt")}</button>
        )}
        {result && (
          <video src={result.url} controls style={{ width: 240, borderRadius: 10, marginLeft: "auto" }} />
        )}
      </div>

      {(busy || progress.frame > 0) && (
        <>
          <div className="progress-outer" role="progressbar" aria-valuenow={pct}>
            <div className="progress-inner" style={{ width: `${pct}%` }} />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {progress.stage === "video" ? "ترميز الفيديو" : progress.stage}: {progress.frame}/{progress.total} إطار ({pct}%)
          </div>
        </>
      )}

      {logs.length > 0 && (
        <div className="log-box" aria-label={t("logs")}>
          {logs.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
    </Modal>
  );
}

function formatTimeSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}ث`;
}
