// مخطّط LLM خالص (بلا شبكة ولا DOM): يبني المواجهة العربية، يحلّل استجابة النموذج
// من وسط نص محاط، يطبّه ضد التسريب والتكرار، ويعيد توازن المدد — ثم يسقط إنتاجاً
// مدفوعاً بالنموذج فوق DirectedPlan. المسار المحلي في director.ts يبقى fallback كاملاً.

import {
  type ScenePlan,
  type StyleId,
  type VideoTypeId,
  type VisualKind,
  estimateDurationFromText,
  planSceneCount,
  sanitizeContent,
  scaleDurations,
} from "./script";
import { type SceneTransitionId, uid } from "./types";
import {
  type AudienceId,
  type ContentAnalysis,
  type DirectorInput,
  directProject,
  type NarrativeBeat,
  type PlatformId,
  type VisualPlan,
  type VisualStyleGuide,
} from "./director";

// ————————————————————————————————————————————————————————————
// قواميس القيم المسموحة (تُضبَط ثم تُقبل؛ ولا شيء خارجها)
// ————————————————————————————————————————————————————————————

const CAMERA_MOVES = ["still", "zoomIn", "zoomOut", "panLeft", "panRight", "driftUp"] as const;
export type CameraMoveId = (typeof CAMERA_MOVES)[number];

const SFX_IDS = ["none", "whoosh", "click", "pop", "sparkle", "impact", "riser"] as const;
export type SfxId = (typeof SFX_IDS)[number];

const TRANSITIONS: SceneTransitionId[] = ["none", "fade", "slideLeft", "slideUp", "zoomIn", "wipeRight"];

function clampCameraMove(raw: unknown): CameraMoveId {
  const s = String(raw ?? "").trim();
  return (CAMERA_MOVES as readonly string[]).includes(s) ? (s as CameraMoveId) : "still";
}

function clampTransition(raw: unknown): SceneTransitionId {
  const s = String(raw ?? "").trim();
  return TRANSITIONS.includes(s as SceneTransitionId) ? (s as SceneTransitionId) : "fade";
}

function clampSfx(raw: unknown): SfxId {
  const s = String(raw ?? "").trim();
  return (SFX_IDS as readonly string[]).includes(s) ? (s as SfxId) : "none";
}

// ————————————————————————————————————————————————————————————
// بناء المواجهة
// ————————————————————————————————————————————————————————————

export interface PlannerRequest {
  idea?: string;
  script?: string;
  type: VideoTypeId;
  style: StyleId;
  audience?: AudienceId;
  platform?: PlatformId;
  durationSeconds: number;
  arabic: true;
}

/** عدد المشاهد المطلوب من النموذج (من الجدول المحلي). */
export function plannerSceneCount(request: PlannerRequest): number {
  return planSceneCount(request.durationSeconds);
}

const TYPE_AR: Record<string, string> = {
  educational: "تعليمي",
  documentary: "وثائقي",
  story: "قصصي سينمائي",
  ad: "إعلاني",
  motion: "موشن جرافيك",
  youtube: "يوتيوب",
  reels: "ريلز عمودي قصير",
  finance: "مالي وشرح مالي",
  trading: "تداول وتحليل أسواق",
};

const STYLE_AR: Record<string, string> = {
  cinematic: "سينمائي",
  professional: "احترافي",
  threed: "ثلاثي الأبعاد",
  infographic: "إنفوغرافيك",
  minimal: "بسيط وأنيق",
  tech: "تقني",
  documentary: "وثائقي",
};

const AUDIENCE_AR: Record<string, string> = {
  children: "أطفال",
  teens: "شباب ومبتدئون",
  general: "جمهور عام",
  business: "أعمال وقادة",
  experts: "متخصصون",
};

const PLATFORM_AR: Record<string, string> = {
  youtube: "يوتيوب",
  shorts: "شورتس عمودي",
  reels: "إنستغرام ريلز",
  tiktok: "تيك توك",
  facebook: "فيسبوك",
  broadcast: "بث وتلفزيون",
  web: "الويب",
};

/** مواجهة النموذج: system + user. في وضع السكريبت يعاد نص المستخدم حرفياً بلا اقتطاع. */
export function buildPlannerPrompt(request: PlannerRequest): { system: string; user: string } {
  const script = (request.script ?? "").trim();
  const idea = (request.idea ?? "").trim();
  const sceneCount = plannerSceneCount(request);

  const system = [
    "أنت مخرج سينمائي وكاتب سيناريو ومدير تصوير ومصمم موشن جرافيك ومهندس صوت.",
    "خطط لفيديو عربي فصيح متقن من الفكرة إلى التصدير.",
    "قواعد صارمة:",
    "1) لا تخترع معلومات غير موجودة في الفكرة ولا تحذف نقطة أساسية منها.",
    "2) لكل مشهد هدف سردي واحد، وفكرة بصرية، ولقطة، وحركة، ونص ظاهر قصير، وتعليق صوتي طبيعي، ومؤثر مناسب.",
    "3) النص الظاهر والتعليق الصوتي بالعربية الفصحى المبسطة، بلا تكرار مشاهد وبلا حشو.",
    "4) ممنوع أن تظهر تعليمات الإخراج داخل الفيديو: لا تكتب في onScreen أو voiceover كلمات مثل: أنشئ أو اجعل أو استخدم أو بأسلوب أو موشن جرافيك أو موسيقى أو تعليق صوتي أو مدة.",
    "5) التعليق الصوتي جمل مباشرة كأنها تُقرَأ أمام الكاميرا، وكل مشهد بين 8 و35 كلمة.",
    "6) أعد JSON فقط: مصفوفة مشاهد بالعدد المطلوب، كل عنصر فيه الحقول التالية:",
    'narrativeGoal (الهدف السردي بالعربية؛ ليس جزءاً من الفيديو), visualIdea (فكرة بصرية عربية), shot (وصف اللقطة بالعربية),',
    'cameraMove (واحدة من: still أو zoomIn أو zoomOut أو panLeft أو panRight أو driftUp),',
    'onScreen (نص قصير يظهر على الشاشة), voiceover (التعليق الصوتي),',
    'sfx (واحدة من: none أو whoosh أو click أو pop أو sparkle أو impact أو riser),',
    'transition (واحدة من: none أو fade أو slideLeft أو slideUp أو zoomIn أو wipeRight).',
    "7) لا تكتب أي شرح قبل JSON أو بعده.",
  ].join("\n");

  const modeLine = script
    ? "المستخدم أرسل سكريبتاً جاهزاً — احرص على كل معلوماته: لا تحذف نقطة أساسية ولا تخترع معلومة جديدة. كسّر الجمل إلى مشاهد، وأعطِ كل مشهد نصاً ظاهراً قصيراً مشتقاً منه، مع الحفاظ على تسلسل الأفكار كما كتبها."
    : "المستخدم أعطى فكرة — طوّرها إلى سيناريو كامل ملتصق بالفكرة، وكل تطوير يجب أن يخدم معناها مباشرة.";

  const lines: string[] = [
    modeLine,
    `نوع الفيديو: ${TYPE_AR[request.type] ?? request.type}`,
    `النمط البصري: ${STYLE_AR[request.style] ?? request.style}`,
    `المدة المستهدفة: تقريباً ${Math.round(request.durationSeconds)} ثانية`,
    `العدد التقريبي للمشاهد: حوالي ${sceneCount} مشهداً`,
  ];
  if (request.audience) lines.push(`الجمهور: ${AUDIENCE_AR[request.audience] ?? request.audience}`);
  if (request.platform) lines.push(`المنصة: ${PLATFORM_AR[request.platform] ?? request.platform}`);
  if (idea) lines.push(`الفكرة: ${idea}`);
  if (script) lines.push("السكريبت الكامل (نص المستخدم حرفياً):", script);
  lines.push("أعد الآن JSON فقط (مصفوفة مشاهد) وفق الحقول المطلوبة.");
  return { system, user: lines.join("\n") };
}

// ————————————————————————————————————————————————————————————
// تحليل الرد: استخراج JSON من وسط نص، تحقق، تطهير، إعادة توازن
// ————————————————————————————————————————————————————————————

export class PlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlannerError";
  }
}

export interface LLMScenePlan {
  narrativeGoal: string;
  visualIdea: string;
  shot: string;
  cameraMove: CameraMoveId;
  onScreen: string;
  voiceover: string;
  sfx: SfxId;
  transition: SceneTransitionId;
  /** تُحسب من التعليق الصوتي وتُعاد موازنتها على المدة المستهدفة. */
  duration: number;
}

/** استخراج أول JSON صالح من وسط نص النموذج (مع أو مع بدون سياج ```json). */
export function extractJsonPayload(raw: string): unknown {
  const trimmed = raw.replace(/```(?:json)?/g, "\n").trim();
  const candidates: string[] = [];
  const starts = [trimmed.indexOf("["), trimmed.indexOf("{")].filter((i) => i >= 0).sort((a, b) => a - b);
  for (const start of starts) {
    const open = trimmed[start];
    const close = open === "[" ? "]" : "}";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < trimmed.length; i += 1) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          candidates.push(trimmed.slice(start, i + 1));
          break;
        }
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed !== null && typeof parsed === "object") return parsed;
    } catch {
      continue;
    }
  }
  throw new PlannerError("رد النموذج لا يحتوي JSON صالحاً قابلاً للحلّ");
}

interface RawScene {
  scene?: Record<string, unknown>;
}

/** يحوّل الرد الخام إلى مشاهد LLM مطهّرة من التسريب، متفريدة، وموازنة المدد على الهدف. */
export function parsePlannerResponse(raw: string, targetSeconds: number): LLMScenePlan[] {
  const payload = extractJsonPayload(raw);
  let array: unknown[];
  if (Array.isArray(payload)) array = payload;
  else if (typeof payload === "object" && payload !== null && Array.isArray((payload as RawScene).scene)) {
    throw new PlannerError("مفتاح المشاهد يجب أن يكون scenes");
  } else if (
    typeof payload === "object" &&
    payload !== null &&
    Array.isArray((payload as Record<string, unknown>).scenes)
  ) {
    array = (payload as Record<string, unknown>).scenes as unknown[];
  } else {
    throw new PlannerError("رد النموذج بلا مشاهد");
  }
  if (array.length === 0) throw new PlannerError("رد النموذج بلا مشاهد");

  const leakRemnants = /(أنشئ|اجعل|استخدم|بأسلوب|موشن ج|موسيقى|تعليق صوتي|مدة)/;
  const scenes: LLMScenePlan[] = [];
  const seenKeys = new Set<string>();
  for (const entry of array) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const narrativeGoal = String(obj.narrativeGoal ?? "").trim();
    const visualIdea = String(obj.visualIdea ?? "").trim();
    const shot = String(obj.shot ?? "").trim();
    const onScreenRaw = String(obj.onScreen ?? "").trim();
    const voiceoverRaw = String(obj.voiceover ?? "").trim();
    if (!onScreenRaw && !voiceoverRaw) continue;
    const onScreen = sanitizeContent(onScreenRaw);
    const voiceover = sanitizeContent(voiceoverRaw);
    if (!onScreen && !voiceover) continue;
    if (leakRemnants.test(onScreen) || leakRemnants.test(voiceover)) continue;
    const dedupeKey = (voiceover || onScreen)
      .replace(/[\u064B-\u0652\u0670]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (dedupeKey && seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    const durationHint = Number(obj.duration);
    const estimated = estimateDurationFromText(voiceover || onScreen);
    scenes.push({
      narrativeGoal: sanitizeContent(narrativeGoal) || "مشهد من قصة الفيديو",
      visualIdea: sanitizeContent(visualIdea),
      shot: sanitizeContent(shot),
      cameraMove: clampCameraMove(obj.cameraMove),
      onScreen: onScreen.slice(0, 120),
      voiceover: voiceover.slice(0, 400),
      sfx: clampSfx(obj.sfx),
      transition: clampTransition(obj.transition),
      duration:
        Number.isFinite(durationHint) && durationHint >= 2 && durationHint <= 25
          ? Math.round(durationHint * 10) / 10
          : estimated,
    });
  }
  if (scenes.length < 2) throw new PlannerError("رد النموذج مشاهد غير كافية");
  rebalancePlannerDurations(scenes, targetSeconds);
  return scenes;
}

/** إعادة حساب المدد من التعليق ثم تضبيط المجموع على المدة المستهدفة (مع حدود لكل مشهد 2–25ث). */
export function rebalancePlannerDurations(scenes: LLMScenePlan[], targetSeconds: number): void {
  for (const scene of scenes) {
    scene.duration = Math.round(Math.max(2, Math.min(25, scene.duration)) * 10) / 10;
  }
  let remaining = targetSeconds - scenes.reduce((a, s) => a + s.duration, 0);
  let guard = 300;
  while (Math.abs(remaining) > 0.05 && guard > 0) {
    guard -= 1;
    const eligible = scenes.filter((s) => (remaining > 0 ? s.duration < 25 : s.duration > 2));
    if (eligible.length === 0) break;
    const share = remaining / eligible.length;
    for (const scene of eligible) {
      const next = Math.max(2, Math.min(25, scene.duration + share));
      remaining -= next - scene.duration;
      scene.duration = Math.round(next * 10) / 10;
    }
  }
  const residual = targetSeconds - scenes.reduce((a, s) => a + s.duration, 0);
  if (Math.abs(residual) > 0) {
    const roomy = scenes.find((s) => (residual > 0 ? s.duration < 25 : s.duration > 2)) ??
      scenes[scenes.length - 1];
    roomy.duration = Math.round(Math.max(2, Math.min(25, roomy.duration + residual)) * 10) / 10;
  }
}

// ————————————————————————————————————————————————————————————
// التدقيق السردي في وضع السكريبت: عدم اختراع محتوى خارج السكريبت
// ————————————————————————————————————————————————————————————

function normalizeForCoverage(text: string): string[] {
  return text
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .replace(/[^\u0621-\u064A]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => (w.startsWith("ال") && w.length > 4 ? w.slice(2) : w));
}

/** نسبة مفردات السكريبت المغطاة داخل مشاهد LLM — طبقة أولى ضد الاختراع. */
export function scriptCoverageRatio(scenes: LLMScenePlan[], script: string): number {
  const scriptWords = new Set(normalizeForCoverage(script));
  if (scriptWords.size === 0) return 1;
  const seen = new Set<string>();
  for (const scene of scenes) {
    for (const word of normalizeForCoverage(`${scene.voiceover} ${scene.onScreen}`)) {
      if (scriptWords.has(word)) seen.add(word);
    }
  }
  return seen.size / scriptWords.size;
}

// ————————————————————————————————————————————————————————————
// الخطة المدفوعة بالنموذج → DirectedPlan
// ————————————————————————————————————————————————————————————

/** يحوّل مشاهد LLM إلى ScenePlan (kind مشتق من الموضع والفكرة البصرية). */
export function toScenePlans(scenes: LLMScenePlan[]): ScenePlan[] {
  return scenes.map((scene, i): ScenePlan => {
    const lower = `${scene.visualIdea} ${scene.shot}`;
    const isChart = /شارت|بيان|رسم بياني|مؤشر|نسبة/.test(lower);
    const kind: VisualKind = i === 0 ? "title" : i === scenes.length - 1 ? "cta" : isChart ? "chart" : "point";
    return {
      title: scene.onScreen.replace(/\s+/g, " ").split(/\s+/).slice(0, 6).join(" ") || `مشهد ${i + 1}`,
      onScreen: scene.onScreen,
      voiceover: scene.voiceover,
      visual: scene.visualIdea || scene.shot,
      duration: scene.duration,
      kind,
    };
  });
}

function roleForScene(analysis: ContentAnalysis, index: number, count: number): NarrativeBeat["role"] {
  if (index === 0) return "hook";
  if (index === count - 1) return analysis.type === "ad" ? "cta" : "resolution";
  if (index === 1) return "setup";
  const cycle: NarrativeBeat["role"][] = ["development", "evidence", "development", "evidence", "turn", "development"];
  return cycle[(index - 2) % cycle.length];
}

/** مشاهد بصرية منظمة لكل مشهد LLM من دليل الأسلوب — بلا تكرار خطط. */
export function buildLLMVisualPlans(
  scenes: LLMScenePlan[],
  analysis: ContentAnalysis,
  styleGuide: VisualStyleGuide,
): VisualPlan[] {
  return scenes.map((scene, i) => {
    const lower = `${scene.visualIdea} ${scene.shot}`;
    const visualType: VisualPlan["visualType"] =
      i === 0
        ? "titleCard"
        : i === scenes.length - 1
          ? "kineticText"
          : /شارت|بيان|رسم بياني|مقارنة|نسبة|مؤشر/.test(lower)
            ? "dataChart"
            : /أيقونة|رمز|رسم توضيحي/.test(lower)
              ? "infographic"
              : /شخص|وجه|طبيعة|مدينة|لقطة|سلويت/.test(lower)
                ? "scene2D"
                : i % 2 === 0
                  ? "infographic"
                  : "kineticText";
    return {
      purpose: scene.narrativeGoal,
      visualType,
      shot: scene.shot || scene.visualIdea || "توجيه بصري يخدم الهدف السردي",
      cameraAngle:
        scene.cameraMove === "still" ? "static" : /لقطة عريضة|منظر عام|افق/.test(lower) ? "wide" : "medium",
      cameraMove: scene.cameraMove,
      composition: /شخص|وجه/.test(lower)
        ? "توسيط الموضوع مع مساحة تنفّس في الأعلى للنص"
        : "توزيع ثالثي: النص في الثلث الأيمن والعنصر البصري يقابله",
      lighting:
        analysis.type === "documentary" || analysis.type === "story"
          ? "إضاءة درامية بتباين عالٍ مع ظلال طويلة"
          : "إضاءة مستوية ناعمة تمنع فقدان تفاصيل النص",
      background: styleGuide.background,
      transition: scene.transition,
      requiredAssets: scene.visualIdea ? [scene.visualIdea] : [],
    };
  });
}

/** يدمج مشاهد LLM مع تحليل ودليل أسلوب المسار المحلي في DirectedPlan كاملاً. */
export function composeDirectedPlan(input: DirectorInput, llmScenes: LLMScenePlan[]): ReturnType<typeof directProject> {
  const base = directProject(input);
  const analysis: ContentAnalysis = { ...base.analysis };
  const beats: NarrativeBeat[] = llmScenes.map((scene, i): NarrativeBeat => ({
    id: uid("beat"),
    role: roleForScene(analysis, i, llmScenes.length),
    purpose: scene.narrativeGoal,
  }));
  const scenePlans = toScenePlans(llmScenes);
  if (Math.abs(scenePlans.reduce((a, s) => a + s.duration, 0) - input.durationSeconds) > 1) {
    scaleDurations(scenePlans, input.durationSeconds);
  }
  return {
    analysis,
    beats,
    styleGuide: base.styleGuide,
    visualPlans: buildLLMVisualPlans(llmScenes, analysis, base.styleGuide),
    plan: { ...base.plan, scenes: scenePlans, targetSeconds: input.durationSeconds },
  };
}

// ————————————————————————————————————————————————————————————
// نقطة الحجز: نموذج إن أمكن، محلي عند أي فشل — دائماً
// ————————————————————————————————————————————————————————————

export interface PlannerLLM {
  /** دالة مُحقنة (نص → نص): core يبقى خالصاً؛ الشبكة الفعلية في طبقة web. */
  complete: (prompt: string) => Promise<string>;
  provider?: string;
  model?: string;
}

export function requestFromInput(input: DirectorInput): PlannerRequest {
  const probe = directProject(input);
  return {
    idea: input.idea,
    script: input.script,
    type: input.type ?? probe.analysis.type,
    style: input.style ?? bestStyleForLLM(probe.analysis.type),
    audience: input.audience,
    platform: input.platform,
    durationSeconds: input.durationSeconds,
    arabic: true,
  };
}

export interface LLMPlanResult extends ReturnType<typeof directProject> {
  engine: "llm" | "local";
  reason?: string;
}

export async function planWithLLM(
  request: PlannerRequest,
  llm: PlannerLLM,
  coverageScript?: string,
): Promise<LLMScenePlan[]> {
  const { system, user } = buildPlannerPrompt(request);
  const raw = await llm.complete(`${system}\n\n===== USER =====\n${user}`);
  const scenes = parsePlannerResponse(raw, request.durationSeconds);
  const reference = coverageScript ?? request.script;
  if (reference) {
    const ratio = scriptCoverageRatio(scenes, reference);
    if (ratio < 0.55) {
      throw new PlannerError(
        `مخرجات النموذج لا تحتوي مفردات السكريبت بما يكفي (تغطية ${Math.round(ratio * 100)}%) — سيرجع النظام للمولّد المحلي حفاظاً على معلوماتك`,
      );
    }
  }
  return scenes;
}

/** إن وُجد LLM ونجح → خطة نموذج؛ وإلا → محلي مع سبب واضح مكتوب في النتيجة. */
export async function directProjectSmart(input: DirectorInput, llm?: PlannerLLM): Promise<LLMPlanResult> {
  const fallback = (): LLMPlanResult => ({ ...directProject(input), engine: "local" });
  if (!llm || typeof llm.complete !== "function") return fallback();
  try {
    const request = requestFromInput(input);
    const scenes = await planWithLLM(request, llm, request.script);
    return { ...composeDirectedPlan(input, scenes), engine: "llm" };
  } catch (error) {
    const reason = error instanceof Error && error.message ? error.message : "فشل الاتصال بالنموذج";
    return { ...fallback(), reason };
  }
}

function bestStyleForLLM(type: VideoTypeId): StyleId {
  const STYLE_BY_TYPE: Record<VideoTypeId, StyleId> = {
    educational: "infographic",
    documentary: "documentary",
    story: "cinematic",
    ad: "cinematic",
    motion: "infographic",
    youtube: "minimal",
    reels: "minimal",
    finance: "tech",
    trading: "tech",
  };
  return STYLE_BY_TYPE[type] ?? "minimal";
}
