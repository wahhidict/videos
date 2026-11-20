// Desktop (Tauri) bridge. Everything is optional: in the browser these are no-ops
// and the UI explains the limitation in Arabic.

interface DesktopBridge {
  saveFile: (defaultName: string, blob: Blob) => Promise<string | null>;
  detectTools: () => Promise<Record<string, boolean>>;
  piperSpeak: (text: string, outPath: string, model: string) => Promise<boolean>;
  whisperTranscribe: (audioPath: string) => Promise<string | null>;
  transcodeToMp4: (input: string, output: string, onLog: (s: string) => void) => Promise<boolean>;
}

function bridge(): DesktopBridge | null {
  return (globalThis as Record<string, unknown>).__MSAI_DESKTOP__ as DesktopBridge | null;
}

export function onDesktop(): boolean {
  return bridge() != null;
}

export async function saveBlobAsFile(defaultName: string, blob: Blob): Promise<string | null> {
  const b = bridge();
  if (b?.saveFile) return b.saveFile(defaultName, blob);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return null;
}
