// أوامر تحرير بلغة طبيعية (عربية) تُحوَّل إلى عمليات منظمة قابلة للتراجع.
// كل أمر: تحليل نصي → قائمة تغييرات محددة → تطبيق على نسخة. بلا إعادة إنتاج للمشروع.

import type { ProjectDoc, Scene } from "./types";
import { formatDurationAr } from "./helpers";

export interface NaturalCommandResult {
  ok: boolean;
  kind: "deleteScene" | "backgroundColor" | "cinematicScene" | "voiceSpeed" | "duckMusic" | "shortenVideo" | "smoothTransitions" | "deleteThisScene" | "unknown";
  summary: string;
  targetScene?: number; // صفرية
  destructive: boolean;
  newDuration?: number;
  hex?: string;
  delta?: number;
}

const ORDINALS: Record<string, number> = {
  الأول: 1,
  الثاني: 2, الثانية: 2,
  الثالث: 3, الثالثة: 3,
  الرابع: 4, الرابعة: 4,
  الخامس: 5, الخامسة: 5,
  السادس: 6, السادسة: 6,
  السابع: 7, السابعة: 7,
  الثامن: 8, الثامنة: 8,
  التاسع: 9, التاسعة: 9,
  العاشر: 10, العاشرة: 10,
};

function parseOrdinal(text: string): number | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  const arabicIndic = normalized.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const num = arabicIndic.match(/\d+/);
  if (num) return Number(num[0]);
  for (const [word, value] of Object.entries(ORDINALS)) {
    if (normalized.includes(word)) return value;
  }
  return null;
}

export function parseArabicCommand(text: string, currentIndex: number, sceneCount: number, currentDuration: number): NaturalCommandResult {
  const t = text.replace(/\s+/g, " ").trim();

  const shortenMatch = t.match(/اختصر|قصّ الفيديو|قص الفيديو|(?:اجعل|اخفض) الفيديو إلى/);
  const minuteMatch = t.match(/(?:إلى)?\s*(?:دقيقة|دقيقتين|دقائق)/);
  const secMatch = t.match(/(\d+|[٠-٩]+)\s*(?:ثاني[ةه]?|ث)/);
  if (shortenMatch && (minuteMatch || secMatch)) {
    let seconds = 60;
    if (secMatch) {
      const digits = secMatch[1].replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
      seconds = Number(digits);
    } else if (minuteMatch) {
      const m = minuteMatch[0];
      seconds = m.includes("دقيقتين") ? 120 : m.includes("دقائق") ? 180 : 60;
    }
    if (seconds >= 5) {
      return {
        ok: true,
        kind: "shortenVideo",
        summary: `تقليص مدة الفيديو من ${formatDurationAr(currentDuration)} إلى ${formatDurationAr(seconds)} — يعدّل مدد كل المشاهد`,
        destructive: true,
        newDuration: seconds,
      };
    }
  }

  if (/(احذف|إحذف|للحذف)/.test(t)) {
    if (/(هذا|الحالي)/.test(t)) {
      return {
        ok: true,
        kind: "deleteThisScene",
        summary: `حذف المشهد رقم ${currentIndex + 1}`,
        targetScene: currentIndex,
        destructive: true,
      };
    }
    const ord = parseOrdinal(t.replace("احذف", "").replace("المشهد", ""));
    if (ord !== null) {
      if (ord < 1 || ord > sceneCount) {
        return { ok: false, kind: "unknown", summary: `لا يوجد مشهد رقم ${ord} (المجال 1-${sceneCount})`, destructive: false };
      }
      return { ok: true, kind: "deleteScene", summary: `حذف المشهد رقم ${ord}`, targetScene: ord - 1, destructive: true };
    }
  }

  if (/(الخلفية|لون الخلفية)/.test(t) && /(إلى|إلی|الى)/.test(t)) {
    const target = t.split(/إلى|إلی|الى/)[1]?.trim() ?? "";
    const color = parseArabicColor(target);
    if (color) {
      return { ok: true, kind: "backgroundColor", summary: `تغيير لون الخلفية إلى «${target.trim()}»`, destructive: false, hex: color };
    }
    return { ok: false, kind: "unknown", summary: `لا أعرف اللون «${target.trim()}» — جرّب: أزرق داكن، كحلي، أسود، رصاصي`, destructive: false };
  }

  if (/المشهد/.test(t) && /سينمائي|سينمائيا|درامي/.test(t) && /(اجعل|غيّر|غير|حول)/.test(t)) {
    const ord = parseOrdinal(t);
    if (ord !== null && ord >= 1 && ord <= sceneCount) {
      return { ok: true, kind: "cinematicScene", summary: `تحويل المشهد ${ord} إلى إحساس سينمائي (تعريض كاميرا + خلفية داكنة + انتقال ناعم)`, targetScene: ord - 1, destructive: false };
    }
  }

  if (/التعليق الصوتي|الصوت/.test(t) && /(أبطأ|ابطأ|أسرع|اسرع)/.test(t)) {
    const slower = /(أبطأ|ابطأ)/.test(t);
    const slightly = /قليلا/.test(t);
    const delta = (slower ? -1 : 1) * (slightly ? 0.1 : 0.25);
    return {
      ok: true,
      kind: "voiceSpeed",
      summary: `${slower ? "إبطاء" : "تسريع"} التعليق الصوتي بنسبة ${Math.abs(delta * 100).toFixed(0)}% — بحد أقصى 1.25x للسرعة الطبيعية`,
      destructive: false,
      delta,
    };
  }

  if (/(اخفض|خفّف|خفف|قلل)\s*(الموسيقى|مستوى الموسيقى)/.test(t)) {
    return { ok: true, kind: "duckMusic", summary: "خفض الموسيقى إلى 25% (بدون تغيير مسارات الكلام)", destructive: false };
  }

  if (/الانتقال(ة|ات)/.test(t) && /(نعومة|أكثر نعومة|ناعمة|ناعم)/.test(t)) {
    return { ok: true, kind: "smoothTransitions", summary: "تحويل جميع الانتقالات إلى تلاشٍ ناعم (fade)", destructive: false };
  }

  return { ok: false, kind: "unknown", summary: "لم أفهم الأمر — جرّب مثل: «اجعل المشهد الثاني سينمائياً» أو «اختصر الفيديو إلى دقيقة»", destructive: false };
}

const COLOR_MAP: { keys: string[]; hex: string }[] = [
  { keys: ["أزرق داكن", "أزرق غامق", "اللون الأزرق الداكن", "أزرق داكن"], hex: "#10214b" },
  { keys: ["أزرق", "اللون الأزرق"], hex: "#1565c0" },
  { keys: ["كحلي", "اللون الكحلي"], hex: "#0a1f3c" },
  { keys: ["أسود", "اللون الأسود"], hex: "#0e1014" },
  { keys: ["رصاصي", "رمادي", "اللون الرصاصي", "اللون الرمادي"], hex: "#3a4150" },
  { keys: ["أبيض", "اللون الأبيض"], hex: "#f4f5f7" },
  { keys: ["أخضر داكن", "اللون الأخضر الداكن"], hex: "#113b24" },
  { keys: ["أخضر", "اللون الأخضر"], hex: "#1f7a3d" },
  { keys: ["أحمر داكن", "اللون الأحمر الداكن"], hex: "#3b1113" },
  { keys: ["أحمر", "اللون الأحمر"], hex: "#b3282d" },
  { keys: ["بنفسجي داكن", "الداكن البنفسجي", "اللون البنفسجي الداكن"], hex: "#2b1150" },
  { keys: ["بنفسجي", "اللون البنفسجي"], hex: "#5c2d91" },
];

function stripDefiniteArticle(text: string): string {
  return text.split(/\s+/).map((w) => w.replace(/^ال/, "")).join(" ").trim();
}

function parseArabicColor(text: string): string | null {
  const clean = stripDefiniteArticle(text.replace(/^(اللون\s+)/, "").trim());
  for (const entry of COLOR_MAP) {
    if (entry.keys.some((k) => clean.includes(stripDefiniteArticle(k)))) return entry.hex;
  }
  return null;
}

/** تطبيق الأمر المحلّل على نسخة من المستند — التعديل يقتصر على ما وصفه الأمر. */
export function applyNaturalCommand(doc: ProjectDoc, result: NaturalCommandResult): boolean {
  if (!result.ok) return false;
  switch (result.kind) {
    case "deleteScene": {
      if (result.targetScene === undefined) return false;
      doc.scenes.splice(result.targetScene, 1);
      doc.audio = doc.audio.filter((track) => !track.sceneId || doc.scenes.some((s) => s.id === track.sceneId));
      return true;
    }
    case "deleteThisScene": {
      if (result.targetScene === undefined) return false;
      doc.scenes.splice(result.targetScene, 1);
      doc.audio = doc.audio.filter((track) => !track.sceneId || doc.scenes.some((s) => s.id === track.sceneId));
      return true;
    }
    case "backgroundColor": {
      const hex = result.hex ?? parseArabicColorFromResult(result.summary);
      if (!hex) return false;
      for (const scene of doc.scenes) {
        scene.background = { ...scene.background, color: hex, color2: hex };
      }
      return true;
    }
    case "cinematicScene": {
      const scene = doc.scenes[result.targetScene ?? -1];
      if (!scene) return false;
      applyCinematicLook(scene);
      return true;
    }
    case "voiceSpeed": {
      const delta = result.delta ?? 0.1;
      doc.voice.mode = "piper";
      doc.voice.speed = Math.min(1.25, Math.max(0.8, doc.voice.speed + delta));
      return true;
    }
    case "duckMusic": {
      let changed = false;
      for (const track of doc.audio) {
        if (track.role === "music") {
          track.volume = 0.25;
          changed = true;
        }
      }
      return changed;
    }
    case "shortenVideo": {
      if (!result.newDuration) return false;
      scaleSceneDurations(doc.scenes, result.newDuration);
      return true;
    }
    case "smoothTransitions": {
      for (const scene of doc.scenes) {
        if (scene.transitionIn !== "none") scene.transitionIn = "fade";
      }
      return true;
    }
    default:
      return false;
  }
}

function parseArabicColorFromResult(summary: string): string | null {
  const quoted = summary.match(/«(.+?)»/);
  return quoted ? parseArabicColor(quoted[1]) : null;
}

/** تقريب مدد المشاهد إلى هدف محدد بنفس دلالات scaleDurations في script. */
function scaleSceneDurations(scenes: Scene[], targetSeconds: number): void {
  const rawTotal = scenes.reduce((a, s) => a + s.duration, 0);
  if (!rawTotal || scenes.length === 0) return;
  const factor = targetSeconds / rawTotal;
  for (const scene of scenes) {
    scene.duration = Math.round(Math.max(2.2, Math.min(30, scene.duration * factor)) * 10) / 10;
  }
  const drift = targetSeconds - scenes.reduce((a, s) => a + s.duration, 0);
  if (Math.abs(drift) > 0.4) {
    const mid = Math.floor(scenes.length / 2);
    scenes[mid].duration = Math.round(Math.max(2.2, Math.min(30, scenes[mid].duration + drift)) * 10) / 10;
  }
}

export function applyCinematicLook(scene: Scene): void {
  scene.camera = { zoom: 1.15, panX: scene.camera.panX, panY: scene.camera.panY };
  scene.background = { ...scene.background, style: "darkCinema" };
  if (scene.transitionIn === "none") scene.transitionIn = "fade";
}
