// Video Quality Controller — فحوصات حقيقية فقط، بلا نسبَ أو درجات وهمية.
// كل فحص يعمل على ProjectDoc الفعلي، وكل إصلاح محدد وقابل للتطبيق والتراجع عبر undo.

import type { ProjectDoc, Scene, AudioTrack, Layer } from "./types";
import { sceneTimings, totalDuration, uid } from "./types";

export type QualityArea = "narrative" | "visual" | "audio" | "technical";

export type AutoFixKind =
  | "dedupeScene"
  | "padSceneTail"
  | "trimSubtitles"
  | "dropEmptyTrack"
  | "resyncVoice"
  | "rebalanceMusic"
  | "clampSpeed";

export interface QualityIssue {
  id: string;
  severity: "error" | "warning" | "info";
  area: QualityArea;
  message: string;
  sceneIndex?: number;
  autoFix?: { kind: AutoFixKind; label: string };
}

export interface QualityReport {
  issues: QualityIssue[];
  passed: string[];
  counts: Record<QualityArea, number>;
  checkedAt: string;
}

const MIN_SCENE_SECONDS = 2.2;
const MAX_VOICE_SPEED = 1.25;
const MIN_VOICE_SPEED = 0.8;

function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .trim();
}

function layerHasText(layer: Layer): boolean {
  return layer.kind === "text" && normalizeText(layer.text).length > 0;
}

export function runQualityChecks(doc: ProjectDoc): QualityReport {
  const issues: QualityIssue[] = [];
  const mk = (
    severity: QualityIssue["severity"],
    area: QualityArea,
    message: string,
    sceneIndex?: number,
    autoFix?: QualityIssue["autoFix"],
  ): QualityIssue => ({ id: uid("iss"), severity, area, message, sceneIndex, autoFix });

  const timings = sceneTimings(doc);
  const voiceTracks = doc.audio.filter((t) => t.role === "voice");
  const musicTracks = doc.audio.filter((t) => t.role === "music");

  // فحوص السرد
  const seen = new Map<string, number>();
  doc.scenes.forEach((scene, i) => {
    const key = `${normalizeText(scene.script)}|${normalizeText(scene.voiceScript)}`;
    if (normalizeText(scene.voiceScript) || normalizeText(scene.script)) {
      if (seen.has(key)) {
        issues.push(
          mk(
            "error",
            "narrative",
            `المشهد ${i + 1} يكرر محتوى المشهد ${seen.get(key)! + 1} حرفياً`,
            i,
            { kind: "dedupeScene", label: "حذف المشهد المكرر" },
          ),
        );
      } else {
        seen.set(key, i);
      }
    }
  });
  if (
    doc.scenes.length > 1 &&
    normalizeText(doc.scenes[doc.scenes.length - 1].script).length === 0 &&
    doc.scenes[doc.scenes.length - 1].layers.every((l) => !layerHasText(l))
  ) {
    issues.push(mk("warning", "narrative", "المشهد الأخير فارغ — الخاتمة تُترك للمشاهد"));
  }

  // فحوص بصرية
  doc.scenes.forEach((scene, i) => {
    if (scene.layers.length === 0) {
      issues.push(mk("error", "visual", `المشهد ${i + 1} لا يحتوي أي عناصر بصرية`, i));
      return;
    }
    for (const layer of scene.layers) {
      if (layer.kind === "text" && !layerHasText(layer)) {
        issues.push(mk("warning", "visual", `المشهد ${i + 1} يحتوي طبقة نص فارغة «${layer.name}»`, i));
      }
      if (layer.x < -0.1 || layer.x > 1.05 || layer.y < -0.1 || layer.y > 1.05 || layer.w > 1.05) {
        issues.push(mk("warning", "visual", `المشهد ${i + 1}: العنصر «${layer.name}» خارج حدود الإطار`, i));
      }
    }
  });
  const styleKeys = doc.scenes.map((s) => `${s.background.style}|${s.background.color}`);
  if (new Set(styleKeys).size === 1 && doc.scenes.length > 3) {
    issues.push(mk("info", "visual", "كل المشاهد تستخدم الخلفية نفسها — قد تصبح الصورة رتيبة على المشاهد الطويلة"));
  }

  // فحوص صوتية
  for (const [i, t] of timings.entries()) {
    const scene = doc.scenes[i];
    const wantsVoice = normalizeText(scene?.voiceScript ?? "").length > 8 && doc.voice.mode !== "none";
    const covered = voiceTracks.some(
      (v: AudioTrack) => v.sceneId === scene.id || (v.startAt < t.end && v.startAt + (v.outPoint ?? Infinity) - v.inPoint > t.start),
    );
    if (wantsVoice && !covered) {
      issues.push(
        mk(
          "error",
          "audio",
          `المشهد ${i + 1} مطلوب له تعليق صوتي لكن لا يوجد مسار صوتي فعلي في الفترة ${t.start.toFixed(1)}-${t.end.toFixed(1)} ث`,
          i,
        ),
      );
    }
  }
  for (const music of musicTracks) {
    const overlapsVoice = voiceTracks.some(
      (v) => v.startAt < music.startAt + (music.outPoint ?? Infinity) - music.inPoint && music.startAt < v.startAt + (v.outPoint ?? Infinity) - v.inPoint,
    );
    if (overlapsVoice && music.volume > 0.35) {
      issues.push(
        mk(
          "warning",
          "audio",
          `مسار الموسيقى «${music.name}» بحجم ${Math.round(music.volume * 100)}% قد يغطي الكلام`,
          undefined,
          { kind: "rebalanceMusic", label: "خفض الموسيقى أثناء الكلام (ducking)" },
        ),
      );
    }
  }
  for (const track of doc.audio) {
    if (!track.assetId || (track.outPoint !== null && track.outPoint - track.inPoint <= 0.01)) {
      issues.push(
        mk("error", "audio", `المسار «${track.name}» فارغ أو يشير إلى أصل مفقود`, undefined, {
          kind: "dropEmptyTrack",
          label: "إزالة المسار الفارغ",
        }),
      );
    }
  }
  if (doc.voice.mode === "piper" && (doc.voice.speed > MAX_VOICE_SPEED || doc.voice.speed < MIN_VOICE_SPEED)) {
    issues.push(
      mk(
        "warning",
        "audio",
        `سرعة الصوت ${doc.voice.speed.toFixed(2)}x خارج النطاق الطبيعي (0.80-1.25x)`,
        undefined,
        { kind: "clampSpeed", label: "ضبط السرعة للنطاق الطبيعي" },
      ),
    );
  }

  // فحوص تقنية
  if (doc.scenes.length === 0) issues.push(mk("error", "technical", "لا توجد مشاهد في المشروع"));
  if (doc.canvas.width <= 0 || doc.canvas.height <= 0) issues.push(mk("error", "technical", "أبعاد الفيديو غير صالحة"));
  if (![24, 25, 30, 60].includes(doc.canvas.fps)) issues.push(mk("error", "technical", `معدل الإطارات ${doc.canvas.fps} غير مدعوم`));
  doc.scenes.forEach((scene, i) => {
    if (!(scene.duration > 0)) {
      issues.push(mk("error", "technical", `المشهد ${i + 1} بلا مدة`, i, {
        kind: "padSceneTail",
        label: "تمديد المشهد للحد الأدنى",
      }));
    } else if (scene.duration < MIN_SCENE_SECONDS) {
      issues.push(
        mk("warning", "technical", `المشهد ${i + 1} أقصر من ${MIN_SCENE_SECONDS} ثوانٍ (${scene.duration.toFixed(1)}ث)`, i, {
          kind: "padSceneTail",
          label: "تمديد المشهد للحد الأدنى",
        }),
      );
    } else if (scene.duration > 30) {
      issues.push(mk("warning", "technical", `المشهد ${i + 1} طويل جداً (${scene.duration.toFixed(1)}ث) — قسّمه لاحقاً`));
    }
  });
  const total = totalDuration(doc);
  for (const cue of doc.subtitles) {
    if (cue.end > total + 0.01) {
      issues.push(mk("warning", "technical", `ترجمة تتجاوز نهاية الفيديو (${cue.end.toFixed(1)}ث > ${total.toFixed(1)}ث)`, undefined, {
        kind: "trimSubtitles",
        label: "قص الترجمة للحدود",
      }));
      break;
    }
    if (cue.start < 0 || cue.end <= cue.start) {
      issues.push(mk("error", "technical", "توقيت ترجمة غير صالح", undefined, { kind: "trimSubtitles", label: "تصحيح توقيت الترجمة" }));
      break;
    }
  }

  const counts = { narrative: 0, visual: 0, audio: 0, technical: 0 } as Record<QualityArea, number>;
  for (const issue of issues) counts[issue.area] += 1;

  const passed: string[] = [];
  if (!counts.narrative) passed.push("لا مشاهد مكررة ولا خاتمة فارغة");
  if (!counts.visual) passed.push("كل المشاهد تحتوي عناصر بصرية داخل حدود الإطار");
  if (!counts.audio) passed.push("التعليق الصوتي والموسيقى متوازنة ومغطاة");
  if (!counts.technical) passed.push("المدد والأبعاد ومعدل الإطارات والتوقيتات سليمة");

  return { issues, passed, counts, checkedAt: new Date().toISOString() };
}

export interface AutoFixResult {
  doc: ProjectDoc;
  applied: { issueId: string; kind: AutoFixKind; message: string }[];
  skipped: { issueId: string; reason: string }[];
}

/** تطبيق الإصلاحات الممكنة تلقائياً — كل إصلاح يُطبق مرة واحدة لكل مشكلة. */
export function applyAutoFixes(doc: ProjectDoc, report: QualityReport): AutoFixResult {
  const result: AutoFixResult = { doc, applied: [], skipped: [] };

  // حذف المشاهد المكررة (يُعالج من النهاية حتى تبقى الفهارس صحيحة)
  const dupIndexes = report.issues
    .filter((i) => i.autoFix?.kind === "dedupeScene" && i.sceneIndex !== undefined)
    .map((i) => i.sceneIndex!)
    .filter((i) => i < doc.scenes.length)
    .sort((a, b) => b - a);
  for (const dupIndex of [...new Set(dupIndexes)]) {
    doc.scenes.splice(dupIndex, 1);
    result.applied.push({ issueId: report.issues.find((i) => i.sceneIndex === dupIndex)!.id, kind: "dedupeScene", message: `حُذف المشهد المكرر رقم ${dupIndex + 1}` });
  }

  // تمديد المشاهد القصيرة جداً
  for (const issue of report.issues.filter((i) => i.autoFix?.kind === "padSceneTail" && i.sceneIndex !== undefined)) {
    const scene = doc.scenes[issue.sceneIndex!];
    if (!scene) continue;
    scene.duration = Math.max(scene.duration, MIN_SCENE_SECONDS);
    result.applied.push({ issueId: issue.id, kind: "padSceneTail", message: `المشهد ${(issue.sceneIndex ?? 0) + 1} مُدد إلى ${MIN_SCENE_SECONDS}ث` });
  }

  // قص/تصحيح الترجمة
  for (const issue of report.issues.filter((i) => i.autoFix?.kind === "trimSubtitles")) {
    const total = totalDuration(doc);
    for (const cue of doc.subtitles) {
      if (cue.end > total) cue.end = total;
      if (cue.start < 0) cue.start = 0;
      if (cue.end <= cue.start) cue.end = Math.min(total, cue.start + 0.8);
    }
    result.applied.push({ issueId: issue.id, kind: "trimSubtitles", message: "صُحّحت توقيتات الترجمة داخل مدة الفيديو" });
  }

  // إزالة المسارات الفارغة
  for (const issue of report.issues.filter((i) => i.autoFix?.kind === "dropEmptyTrack")) {
    const before = doc.audio.length;
    doc.audio = doc.audio.filter((t) => t.assetId && (t.outPoint === null || t.outPoint - t.inPoint > 0.01));
    if (doc.audio.length < before) {
      result.applied.push({ issueId: issue.id, kind: "dropEmptyTrack", message: `أُزيل ${before - doc.audio.length} مسار صوتي فارغ` });
    }
  }

  // مزامنة المسارات الصوتية مع مشاهد المرجع
  const timings = sceneTimings(doc);
  for (const issue of report.issues.filter((i) => i.autoFix?.kind === "resyncVoice")) {
    let moved = 0;
    for (const track of doc.audio.filter((t) => t.role === "voice" && t.sceneId)) {
      const timing = timings.find((t) => doc.scenes[t.index].id === track.sceneId);
      if (timing && Math.abs(track.startAt - timing.start) > 0.05) {
        track.startAt = timing.start;
        moved += 1;
      }
    }
    result.applied.push({ issueId: issue.id, kind: "resyncVoice", message: `مُزامن ${moved} مسار صوتي مع بدايات المشاهد` });
  }

  // خفض الموسيقى أثناء الكلام (ducking) + قص نهاية المسار على مدة الفيديو
  for (const issue of report.issues.filter((i) => i.autoFix?.kind === "rebalanceMusic")) {
    let ducked = 0;
    const total = totalDuration(doc);
    for (const track of doc.audio.filter((t) => t.role === "music")) {
      if (track.volume > 0.25) {
        track.volume = 0.25;
        ducked += 1;
      }
      if (track.startAt + (track.outPoint ?? Infinity) - track.inPoint > total) {
        track.outPoint = track.inPoint + Math.max(0.5, total - track.startAt);
        if (!track.fadeOut) track.fadeOut = 0.8;
      }
    }
    result.applied.push({ issueId: issue.id, kind: "rebalanceMusic", message: `خُفِض حجم ${ducked} مسار موسيقى إلى 25% مع fade-out` });
  }

  // ضبط سرعة الصوت داخل النطاق الطبيعي
  for (const issue of report.issues.filter((i) => i.autoFix?.kind === "clampSpeed")) {
    const before = doc.voice.speed;
    doc.voice.speed = Math.min(MAX_VOICE_SPEED, Math.max(MIN_VOICE_SPEED, doc.voice.speed));
    if (doc.voice.speed !== before) {
      result.applied.push({ issueId: issue.id, kind: "clampSpeed", message: `ضُبطت سرعة الصوت من ${before.toFixed(2)}x إلى ${doc.voice.speed.toFixed(2)}x` });
    }
  }

  if (result.applied.length === 0) return result;

  const recheck = runQualityChecks(result.doc);
  const fixedIds = new Set(result.applied.map((a) => a.issueId));
  result.skipped.push(
    ...recheck.issues.filter((i) => fixedIds.has(i.id)).map((i) => ({ issueId: i.id, reason: "بقي بعد الإصلاح" })),
  );
  return result;
}
