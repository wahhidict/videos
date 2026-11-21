// Desktop bridge: exposes real local file/TTS/transcode functions when the app
// runs inside the Tauri shell (withGlobalTauri). In the browser it stays inert
// and the UI shows Arabic notices instead.

interface TauriGlobal {
  core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
  event?: { listen?: (name: string, handler: (e: { payload: unknown }) => void) => Promise<() => void> };
}

function tauri(): TauriGlobal | null {
  if (!("__TAURI_INTERNALS__" in globalThis)) return null;
  const g = (globalThis as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  if (!g?.core?.invoke) return null;
  return g;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function connectLogs(onLog: (s: string) => void): Promise<() => void> {
  const g = tauri();
  if (!g?.event?.listen) return () => undefined;
  const un = await g.event.listen("export-log", (e) => onLog(String(e.payload ?? "")));
  return un;
}

export interface ToolProgress {
  tool: string;
  step: string;
  pct: number;
  done?: boolean;
  error?: boolean;
  cancelled?: boolean;
}

export function installDesktopBridge(): void {
  if ((globalThis as unknown as Record<string, unknown>).__MSAI_DESKTOP__) return;
  const g = tauri();
  if (!g) return;

  const invoke = (cmd: string, args?: Record<string, unknown>) =>
    (g.core?.invoke as (c: string, a?: Record<string, unknown>) => Promise<unknown>)(cmd, args);

  (globalThis as unknown as Record<string, unknown>).__MSAI_DESKTOP__ = {
    saveFile: async (defaultName: string, blob: Blob): Promise<string | null> => {
      const dataBase64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
      const path = await invoke("save_file", { defaultName, dataBase64 });
      return typeof path === "string" ? path : null;
    },
    detectTools: async (): Promise<Record<string, boolean>> => {
      try {
        const res = await invoke("detect_tools");
        return (res ?? {}) as Record<string, boolean>;
      } catch {
        return {};
      }
    },
    piperSpeak: async (text: string, model: string, lengthScale?: number): Promise<Blob | null> => {
      const out = await invoke("piper_tts", { text, model, lengthScale: lengthScale ?? null });
      if (typeof out !== "string" || !out) return null;
      const bin = atob(out);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: "audio/wav" });
    },
    whisperTranscribeFile: async (file: Blob, fileName: string): Promise<string | null> => {
      const dataBase64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
      const out = await invoke("whisper_transcribe", { dataBase64, fileName });
      return typeof out === "string" ? out : null;
    },
    transcodeToMp4: async (input: string, output: string, onLog: (s: string) => void): Promise<boolean> => {
      const un = await connectLogs(onLog);
      try {
        const ok = await invoke("transcode_to_mp4", { input, output });
        return ok === true;
      } finally {
        un();
      }
    },
    installTool: async (tool: string): Promise<boolean> => {
      try {
        return (await invoke("install_tool", { tool })) === true;
      } catch {
        return false;
      }
    },
    cancelInstall: async (tool: string): Promise<boolean> => {
      try {
        return (await invoke("cancel_install", { tool })) === true;
      } catch {
        return false;
      }
    },
    onToolProgress: async (cb: (p: ToolProgress) => void): Promise<() => void> => {
      if (!g?.event?.listen) return () => undefined;
      const un = await g.event.listen("tool-progress", (e) => cb((e.payload ?? {}) as ToolProgress));
      return un;
    },
    openToolsFolder: async (): Promise<void> => {
      try { await invoke("open_tools_folder"); } catch { /* ignore */ }
    },
    pathExists: async (path: string): Promise<boolean> => true,
  };
}
