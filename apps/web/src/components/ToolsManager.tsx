// مدير تثبيت الأدوات الاختيارية عبر الواجهة: Piper + صوت عربي، Whisper + نموذج، FFmpeg.
// لا تنزيل إلا بموافقة صريحة تُعرض فيها الأحجام والمصادر والخطوات قبل البدء.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/appState";
import type { ToolProgress } from "../desktop/bridge";
import { Modal } from "./Modal";

interface ToolsState {
  ffmpeg?: boolean;
  piper?: boolean;
  whisper?: boolean;
  piperVoice?: boolean;
  whisperModel?: boolean;
}

interface DesktopExt {
  detectTools?: () => Promise<Record<string, boolean>>;
  installTool?: (tool: string) => Promise<boolean>;
  onToolProgress?: (cb: (p: ToolProgress) => void) => Promise<() => void>;
}

function desktopExt(): DesktopExt | null {
  return (globalThis as { __MSAI_DESKTOP__?: DesktopExt }).__MSAI_DESKTOP__ ?? null;
}

const TOOLS: { id: string; icon: string; name: string; desc: string; parts: string[]; totalMb: number; sources: string[] }[] = [
  {
    id: "piper",
    icon: "🗣",
    name: "Piper — تعليق صوتي عربي",
    desc: "تحويل النص إلى كلام عربي واقعي محلياً بدون إنترنت (صوت “كريم” الذكوري).",
    parts: ["برنامج Piper لويندوز — ≈ 21 م.ب", "الصوت العربي ar_JO-kareem — ≈ 60 م.ب", "بيانات الصوت — < 1 م.ب"],
    totalMb: 82,
    sources: ["github.com/rhasspy/piper", "huggingface.co/rhasspy/piper-voices"],
  },
  {
    id: "whisper",
    icon: "📝",
    name: "Whisper — تفريغ التسجيلات نصياً",
    desc: "تحويل الصوت إلى ترجمة نصية عربية/إنجليزية محلياً (whisper.cpp + النموذج الصغير).",
    parts: ["برنامج whisper.cpp لويندوز — ≈ 9 م.ب", "النموذج الصغير ggml-tiny — ≈ 75 م.ب"],
    totalMb: 84,
    sources: ["github.com/ggml-org/whisper.cpp", "huggingface.co/ggerganov/whisper.cpp"],
  },
  {
    id: "ffmpeg",
    icon: "🎬",
    name: "FFmpeg — ترميز الفيديو",
    desc: "تحويل المقاطع إلى MP4/H.264 بضغطة زر داخل التطبيق (تصدير سطح المكتب).",
    parts: ["حزمة FFmpeg الأساسية لويندوز — ≈ 114 م.ب"],
    totalMb: 114,
    sources: ["www.gyan.dev/ffmpeg/builds"],
  },
];

export function ToolsManager() {
  const { ai, setAI, showToast, t, isDesktop } = useApp();
  const [tools, setTools] = useState<ToolsState | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [prog, setProg] = useState<ToolProgress | null>(null);
  const unlisten = useRef<() => void>(() => undefined);

  const refresh = async () => {
    const ext = desktopExt();
    if (!ext?.detectTools) { setTools({}); return; }
    setTools((await ext.detectTools()) as ToolsState);
  };

  useEffect(() => {
    void refresh();
    return () => unlisten.current();
  }, []);

  const startInstall = async (id: string) => {
    setConfirmId(null);
    const ext = desktopExt();
    if (!ext?.installTool) { showToast(t("toolsWindowsOnly")); return; }
    setBusyId(id);
    setProg({ tool: id, step: "", pct: 0 } as ToolProgress);
    unlisten.current = (await ext.onToolProgress?.((p) => {
      if (p.tool !== id) return;
      setProg(p);
      if (p.done) {
        unlisten.current();
        setBusyId(null);
        showToast(p.error ? t("toolsFailed") : t("toolsDone"));
        void refresh();
      }
    })) ?? (() => undefined);
    const started = await ext.installTool(id);
    if (!started) {
      setBusyId(null);
      showToast(t("toolsFailed"));
    }
  };

  return (
    <>
      <h2 style={{ fontSize: 21 }}>🧰 {t("toolsTitle")}</h2>
      <p className="muted">{t("toolsDesc")}</p>

      {TOOLS.map((tool) => {
        const installed =
          tool.id === "piper" ? Boolean(tools?.piper && tools.piperVoice)
          : tool.id === "whisper" ? Boolean(tools?.whisper && tools.whisperModel)
          : Boolean(tools != null && tools.ffmpeg);
        return (
          <div className="ai-card" key={tool.id}>
            <div className="head">
              <b>{tool.icon} {tool.name}</b>
              <span className={`badge ${installed ? "ok" : "off"}`}>{installed ? t("toolsInstalled") : t("toolsMissing")}</span>
              <span style={{ flex: 1 }} />
              {tool.id === "piper" && (
                <label className="chip-row" style={{ gap: 6 }}>
                  <span className="muted" style={{ fontSize: 13 }}>{t("aiEnabled")}</span>
                  <input type="checkbox" checked={ai.piperEnabled} onChange={(e) => setAI({ ...ai, piperEnabled: e.target.checked })} />
                </label>
              )}
              {tool.id === "whisper" && (
                <label className="chip-row" style={{ gap: 6 }}>
                  <span className="muted" style={{ fontSize: 13 }}>{t("aiEnabled")}</span>
                  <input type="checkbox" checked={ai.whisperEnabled} onChange={(e) => setAI({ ...ai, whisperEnabled: e.target.checked })} />
                </label>
              )}
            </div>
            <div className="desc">{tool.desc}</div>
            <div className="kv"><span>{t("modelSize")}:</span> <b>≈ {tool.totalMb} م.ب</b></div>
            {installed ? (
              <p className="muted" style={{ marginTop: 8 }}>✓ {t("toolsDone")}</p>
            ) : (
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn small primary" onClick={() => setConfirmId(tool.id)}>
                  ⬇ {t("toolsInstallBtn")} (≈ {tool.totalMb} م.ب)
                </button>
                {!isDesktop && <span className="muted" style={{ fontSize: 13 }}>⚠ {t("toolsWindowsOnly")}</span>}
              </div>
            )}
          </div>
        );
      })}

      {confirmId != null && (
        <Modal title={t("toolsConsentTitle")} onClose={() => setConfirmId(null)}>
          {(() => {
            const tool = TOOLS.find((x) => x.id === confirmId)!;
            return (
              <>
                <p className="muted" style={{ marginBottom: 10 }}>{t("toolsConsentNote")}</p>
                <ul style={{ lineHeight: 1.9, margin: "0 0 10px", paddingLeft: 0, paddingRight: 16 }}>
                  {tool.parts.map((p) => <li key={p}>{p}</li>)}
                </ul>
                <div className="kv"><span>{t("storage")}:</span> <b>≈ {tool.totalMb} م.ب</b></div>
                <div className="kv"><span>المصادر:</span> <b style={{ fontSize: 12.5, direction: "ltr", display: "inline-block" }}>{tool.sources.join(" · ")}</b></div>
                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn gold" onClick={() => void startInstall(tool.id)}>
                    ⬇ {t("toolsDownloadBtn")} (≈ {tool.totalMb} م.ب)
                  </button>
                  <button className="btn" onClick={() => setConfirmId(null)}>{t("cancel")}</button>
                </div>
              </>
            );
          })()}
        </Modal>
      )}

      {busyId != null && prog && (
        <Modal title={t("toolsDownloading")} onClose={() => undefined}>
          <div style={{ margin: "10px 0 6px", fontWeight: 700 }}>{prog.step || "…"}</div>
          <div className="progress-outer" role="progressbar" aria-valuenow={Math.round(prog.pct)}>
            <div className="progress-inner" style={{ width: `${Math.round(prog.pct)}%` }} />
          </div>
          <div className="muted" style={{ marginTop: 6 }}>{Math.round(prog.pct)}%</div>
        </Modal>
      )}
    </>
  );
}
