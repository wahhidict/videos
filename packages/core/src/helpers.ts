export function estimateSceneDuration(text: string, min = 3.5, max = 14): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(min, Math.min(max, 1.6 + words / 1.5));
}

export function extractTitleSafe(line: string): string {
  const short = line.split(/[،,,:.؟!]/)[0] ?? line;
  const words = short.split(/\s+/).slice(0, 6).join(" ");
  return words || "مشهد";
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(m)}:${p2(r)}`;
}

export function formatDurationAr(sec: number): string {
  const s = Math.max(0, sec);
  const rounded = Math.round(s * 10) / 10;
  if (rounded < 60) {
    return `${rounded} ثوانٍ`;
  }
  return formatTime(rounded);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ج.ب`;
}
