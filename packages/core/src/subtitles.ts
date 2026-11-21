import type { ProjectDoc, SubtitleCue } from "./types";
import { uid } from "./types";

type Ctx2D = CanvasRenderingContext2D;

/** Serialize cues to SRT (supports Arabic text, UTF-8 with BOM handled by caller). */
export function toSRT(cues: SubtitleCue[]): string {
  const fmt = (t: number) => {
    const total = Math.max(0, t);
    const ms = Math.floor((total % 1) * 1000);
    const s = Math.floor(total) % 60;
    const m = Math.floor(total / 60) % 60;
    const hh = Math.floor(total / 3600);
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${p2(hh)}:${p2(m)}:${p2(s)},${String(ms).padStart(3, "0")}`;
  };
  return cues
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`)
    .join("\n");
}

function parseStamp(stamp: string): number {
  const m = stamp.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!m) return 0;
  return (
    Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000
  );
}

export function fromSRT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = content.replace(/\r/g, "").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (!lines.length) continue;
    const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeLineIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeLineIdx].split("-->");
    const text = lines.slice(timeLineIdx + 1).join("\n").trim();
    if (!text) continue;
    cues.push({
      id: uid("cue"),
      start: parseStamp(startRaw),
      end: parseStamp(endRaw),
      text,
    });
  }
  return cues.sort((a, b) => a.start - b.start);
}

const AR_STOPWORDS = new Set([
  "من","في","على","عن","إلى","الى","مع","هذا","هذه","ذلك","التي","الذي","هو","هي","أن","أنه","إن","كان","كانت","لا","ما","ثم","أو","او","كل","بين","عند","بعد","قبل","حتى","قد","هناك",
]);

/** Split a narration text into short, well-timed Arabic caption chunks. */
export function chunkText(text: string, maxChars = 42): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let len = 0;
  for (const w of words) {
    if (len + w.length + 1 > maxChars && current.length) {
      chunks.push(current.join(" "));
      current = [];
      len = 0;
    }
    current.push(w);
    len += w.length + 1;
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

export interface CueBuildOptions {
  wordsPerSecond?: number; // Arabic narration ~2.5 w/s at natural pace
}

/** Build subtitle cues aligned to a scene position on the global timeline. */
export function buildCuesForScene(
  script: string,
  sceneStart: number,
  sceneDuration: number,
  opts: CueBuildOptions = {},
): SubtitleCue[] {
  const wps = opts.wordsPerSecond ?? 2.2;
  const chunks = chunkText(script);
  if (!chunks.length) return [];
  const totalWords = script.split(/\s+/).filter(Boolean).length;
  const spoken = totalWords / wps;
  const scale = spoken > 0 ? Math.min(sceneDuration / spoken, 2.2) : 1;
  let t = sceneStart;
  return chunks.map((text) => {
    const dur = Math.max(1, (text.split(/\s+/).length / wps) * scale);
    const end = Math.min(t + dur, sceneStart + sceneDuration);
    const cue: SubtitleCue = { id: uid("cue"), start: t, end, text };
    t += dur;
    return cue;
  });
}

/** Distribute the narration of every scene into cues across the whole timeline. */
export function autoSubtitles(doc: ProjectDoc): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let t = 0;
  for (const scene of doc.scenes) {
    const source = scene.voiceScript || scene.script;
    if (source.trim()) {
      cues.push(...buildCuesForScene(source, t, scene.duration));
    }
    t += scene.duration;
  }
  return cues;
}

export function cueAt(cues: SubtitleCue[], time: number): SubtitleCue | null {
  for (const c of cues) {
    if (time >= c.start && time < c.end) return c;
  }
  return null;
}

/** Word index at a moment inside a cue (for animated captions / karaoke highlight). */
export function activeWordIndex(cue: SubtitleCue, time: number): number {
  const words = cue.text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return 0;
  const total = cue.end - cue.start;
  const p = Math.min(0.999, Math.max(0, (time - cue.start) / total));
  return Math.floor(p * words.length);
}

export function drawSubtitles(
  doc: ProjectDoc,
  ctx: Ctx2D,
  w: number,
  h: number,
  time: number,
): void {
  const cue = cueAt(doc.subtitles, time);
  if (!cue) return;
  const st = doc.subtitleStyle;
  const fontSize = st.fontSize * (h / 1080);
  const y = h * st.position - fontSize;
  ctx.save();
  ctx.direction = doc.lang === "ar" ? "rtl" : "ltr";
  ctx.font = `700 ${Math.round(fontSize)}px "Cairo", "Tajawal", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  if (st.animated && /[\u0600-\u06FF]/.test(cue.text)) {
    const words = cue.text.split(/\s+/).filter(Boolean);
    const idx = activeWordIndex(cue, time);
    const spaceW = ctx.measureText(" ").width;
    const widths = words.map((word) => ctx.measureText(word).width);
    const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * (words.length - 1);
    let x = w / 2 + totalW / 2;
    words.forEach((word, i) => {
      x -= widths[i];
      ctx.textAlign = "left";
      ctx.fillStyle = i === idx ? st.highlightColor : st.color;
      const scale = i === idx ? 1.08 : 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillText(word, 0, 0);
      ctx.restore();
      x -= spaceW;
    });
  } else {
    ctx.fillStyle = st.color;
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = fontSize * 0.25;
    const lines = cue.text.split("\n");
    lines.forEach((line, i) => ctx.fillText(line, w / 2, y + i * fontSize * 1.25));
  }
  ctx.restore();
}
