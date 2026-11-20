// AI Director — وحدة المخرج المركزي: من الفكرة/السكريبت إلى خطة إنتاج متماسكة.
// عمل محلي خالص (بدون إنترنت)؛ مكوّنات موصولة بمزوّد LLM لاحقاً تُسقَط فوق نفس البنية.

import {
  type BackgroundStyleId,
  type MotionPresetId,
  type SceneTransitionId,
  uid,
} from "./types";
import {
  type StyleId,
  type VideoTypeId,
  deriveTopic,
  planSceneCount,
  planStoryboard,
  planStoryboardFromScript,
  sanitizeContent,
} from "./script";
import { PALETTES, VERTICAL_TYPES } from "./builder";

export type AudienceId = "children" | "teens" | "general" | "business" | "experts";
export type PlatformId = "youtube" | "shorts" | "reels" | "tiktok" | "facebook" | "broadcast" | "web";
export type ToneId = "educational" | "cinematic" | "commercial" | "documentary" | "energetic" | "calm";

export interface ContentAnalysis {
  inputMode: "idea" | "script";
  type: VideoTypeId;
  audience: AudienceId;
  platform: PlatformId;
  vertical: boolean;
  topic: string;
  message: string;
  subIdeas: string[];
  tone: ToneId;
  durationSeconds: number;
}

export interface NarrativeBeat {
  id: string;
  role: "hook" | "setup" | "development" | "evidence" | "turn" | "resolution" | "cta";
  purpose: string;
}

export type VisualType =
  | "titleCard"
  | "infographic"
  | "dataChart"
  | "kineticText"
  | "scene2D"
  | "typography"
  | "productShot"
  | "mixedMedia";

export interface VisualPlan {
  purpose: string;
  visualType: VisualType;
  shot: string;
  cameraAngle: "static" | "wide" | "medium" | "closeup" | "topDown";
  cameraMove: "still" | "zoomIn" | "zoomOut" | "panLeft" | "panRight" | "driftUp";
  composition: string;
  lighting: string;
  background: BackgroundStyleId;
  transition: SceneTransitionId;
  requiredAssets: string[];
}

export interface VisualStyleGuide {
  styleId: StyleId;
  palette: string[];
  textTone: string;
  background: BackgroundStyleId;
  motionSignature: MotionPresetId[];
  transitionLanguage: SceneTransitionId[];
  grammarAr: string;
}

export interface DirectedPlan {
  analysis: ContentAnalysis;
  beats: NarrativeBeat[];
  styleGuide: VisualStyleGuide;
  visualPlans: VisualPlan[];
  plan: ReturnType<typeof planStoryboard>;
}

const TYPE_HINTS: [RegExp, VideoTypeId][] = [
  [/وثائق|توثيق|حكاية حقيق|تاريخي/, "documentary"],
  [/إعلان|اعلان|عرض ترويج|متجر|مطعم|منتج|عقار|خدمات|تسويق|علامة/, "ad"],
  [/قصة|درام|سينمائ|روائي/, "story"],
  [/تداول|مالي|أسهم|بورصة|عملات|استثمار|محفظة/, "finance"],
  [/توقعات السوق|اتجاهات السوق|تحليل مؤشر/, "trading"],
  [/ريلز|reels|تيك ?توك|شورت|قصير عمودي/, "reels"],
  [/يوتيوب|فلوق|فيديو قناة/, "youtube"],
  [/إنفوغراف|موشن ج|رسوم متحركة|تحريك ثنائي/, "motion"],
  [/شرح|تعليم|درس|دروس|مفهوم|خطوات|توضيح|أهمية/, "educational"],
];

const AUDIENCE_HINTS: [RegExp, AudienceId][] = [
  [/أطفال|للصغار|طلاب ابتدائي/, "children"],
  [/شباب|مراهق|للمبتدئين|جيل جديد/, "teens"],
  [/أعمال|شركات|مستثمر|رواد أعمال|صنّاع قرار|صناع قرار/, "business"],
  [/متخصص|مهندسين|أطباء|محترفين|مثبتين/, "experts"],
];

const PLATFORM_HINTS: [RegExp, PlatformId][] = [
  [/ريلز|reels|إنستغرام|انستغرام/, "reels"],
  [/تيك ?توك|tiktok/, "tiktok"],
  [/شورت|shorts/, "shorts"],
  [/فيسبوك|facebook/, "facebook"],
  [/تلفزيون|إذاعة|broadcast/, "broadcast"],
  [/موقع|عرض توضيحي|ويب/, "web"],
];

const TONE_BY_TYPE: Record<VideoTypeId, ToneId> = {
  educational: "educational",
  documentary: "documentary",
  story: "cinematic",
  ad: "commercial",
  motion: "educational",
  youtube: "energetic",
  reels: "energetic",
  finance: "educational",
  trading: "educational",
};

const BACKGROUND_BY_TYPE: Record<VideoTypeId, BackgroundStyleId[]> = {
  educational: ["gradientCalm", "dotsGrid", "gradientMove"],
  documentary: ["darkCinema", "spotlight", "gradientCalm"],
  story: ["darkCinema", "spotlight", "particles"],
  ad: ["spotlight", "gradientMove", "particles"],
  motion: ["gradientMove", "dotsGrid", "techGrid"],
  youtube: ["gradientMove", "particles", "gradientCalm"],
  reels: ["particles", "gradientMove", "spotlight"],
  finance: ["techGrid", "darkCinema", "dotsGrid"],
  trading: ["techGrid", "darkCinema", "waves"],
};

const TYPE_PURPOSE: Record<VideoTypeId, string> = {
  educational: "التوضيح التدريجي لمفهوم واحد واضح",
  documentary: "الشهادة والسرد الواقعي بثبات هادئ",
  story: "بناء توتر ثم غلق الحبكة بشكل مرضي",
  ad: "إبراز المشكلة ثم الحل ثم دعوة للفعل",
  motion: "تبسيط الفكرة برسوم حركية مواردية",
  youtube: "جذب الانتباه مبكراً وضبط وتيرة متسارعة",
  reels: "صدمة افتتاحية وقيمة فورية في آمن قصير",
  finance: "أرقام موثوقة وشرح العلاقة بين المتغيرات",
  trading: "قراءة المؤشرات بتحفظ ووضوح مخاطر",
};

function detectFrom<T>(text: string, hints: [RegExp, T][], fallback: T): T {
  for (const [pattern, value] of hints) {
    if (pattern.test(text)) return value;
  }
  return fallback;
}

/** استخراج الرسالة الأساسية: أول جملة خالية من أفعال الإخراج بعد التطهير. */
function deriveMessage(input: string, topic: string): string {
  const sentences = input
    .replace(/\s+/g, " ")
    .split(/[.،;؟?!]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  const cleaned = sentences.map((s) => sanitizeContent(s)).filter((s) => s.length > 8);
  const best = cleaned.sort((a, b) => b.length - a.length)[0] ?? "";
  const short = best.split(/\s+/).slice(0, 12).join(" ");
  return short || topic;
}

/** أفكار فرعية من سطرين/بنود أو من فواصل الجمل — دون إعادة صياغة النص الأصلي. */
function deriveSubIdeas(input: string): string[] {
  const lines = input
    .split(/\n+/)
    .map((l) => l.replace(/^[\d\-•*\s]+/, "").trim())
    .filter((l) => l.length > 6);
  const source = lines.length > 1 ? lines : input.split(/[،,؛]/).map((s) => s.trim());
  const ideas = source.map((s) => sanitizeContent(s)).filter((s) => s.length > 6 && s.length < 90);
  return [...new Set(ideas)].slice(0, 8);
}

/** المرحلة 2: بنية سردية مناسبة للنوع والمدة — أوزان تُترجم لاحتمالات مدد. */
export function planNarrative(analysis: ContentAnalysis, sceneCount: number): NarrativeBeat[] {
  const mk = (role: NarrativeBeat["role"], purpose: string): NarrativeBeat => ({
    id: uid("beat"),
    role,
    purpose,
  });
  const hook = mk(
    "hook",
    TYPE_PURPOSE[analysis.type].startsWith("إبراز")
      ? "سؤال أو موقف يخلق فضولاً فورياً"
      : "مدخل يربط المشاهد بفائدة شخصية لها",
  );
  const setup = mk("setup", "تأطير الرسالة الأساسية بجملة واحدة واضحة");
  const cta = mk(
    analysis.type === "ad" ? "cta" : "resolution",
    analysis.type === "ad"
      ? "دعوة لإجراء محددة وواضحة"
      : "خلاصة عملية تُغلق الأفكار دون إعادة كلام سابق",
  );
  const midRoles = ({
    educational: ["development", "development", "evidence", "development", "evidence"],
    documentary: ["development", "evidence", "turn", "evidence"],
    story: ["development", "turn", "evidence"],
    ad: ["development", "evidence"],
    motion: ["development", "evidence", "development"],
    youtube: ["development", "development", "evidence"],
    reels: ["development", "evidence"],
    finance: ["development", "evidence", "evidence"],
    trading: ["development", "evidence"],
  } as Record<VideoTypeId, NarrativeBeat["role"][]>)[analysis.type];
  const middle: NarrativeBeat[] = [];
  for (let i = 0; i < Math.max(0, sceneCount - 2); i += 1) {
    middle.push(mk(midRoles[i % midRoles.length], `${TYPE_PURPOSE[analysis.type]} — خطوة ${i + 1}`));
  }
  return [hook, setup, ...middle, cta];
}

/** السابع بهوية ثابتة: دليل أسلوب بصري يُستخدم في كل المشاهد. */
export function buildStyleGuide(style: StyleId, type: VideoTypeId): VisualStyleGuide {
  const palette = PALETTES[style];
  return {
    styleId: style,
    palette: [palette.bg.color, palette.bg.color2, palette.accent, palette.textColor],
    textTone:
      type === "documentary"
        ? "ضبط هادئ، جمل متوسطة الطول، مصطلح واحد لكل مشهد"
        : type === "ad"
          ? "إيقاع سريع، جمل قصيرة، فعل أمر واحد في الخاتمة"
          : "لغة فصحى سهلة، جمل قصيرة، بدون مصطلحات دون شرح",
    background: BACKGROUND_BY_TYPE[type][0],
    motionSignature:
      type === "documentary" ? ["fadeIn", "fadeInUp"] : type === "ad" ? ["popIn", "scaleUp"] : ["fadeInUp", "scaleUp", "typewriter"],
    transitionLanguage:
      type === "documentary" ? ["fade", "none"] : type === "ad" ? ["zoomIn", "slideLeft"] : ["fade", "slideUp", "fade"],
    grammarAr:
      "عربية فصحى صحيحة: جمل مباشرة الخانة، لا فقرات مكررة، لا تعليمات إخراج داخل النص الظاهر",
  };
}

/** المرحلة 6: خطة بصرية منظمة لكل مشهد بناءً على دوره السردي — لا صور عشوائية. */
export function buildVisualPlans(
  beats: NarrativeBeat[],
  analysis: ContentAnalysis,
  styleGuide: VisualStyleGuide,
): VisualPlan[] {
  const type = analysis.type;
  const backgrounds = BACKGROUND_BY_TYPE[type];
  const planFor = (beat: NarrativeBeat, i: number, isLast: boolean): VisualPlan => {
    const bg = i === 0 ? BACKGROUND_BY_TYPE[type][0] : backgrounds[i % backgrounds.length];
    const visualType: VisualType =
      i === 0
        ? "titleCard"
        : isLast
          ? type === "ad"
            ? "kineticText"
            : "kineticText"
          : beat.role === "evidence"
            ? type === "finance" || type === "trading"
              ? "dataChart"
              : "infographic"
            : beat.role === "turn"
              ? "scene2D"
              : i % 3 === 1
                ? "infographic"
                : "kineticText";
    const cameraMove: VisualPlan["cameraMove"] =
      beat.role === "hook" ? "zoomIn" : beat.role === "cta" ? "still" : i % 3 === 0 ? "driftUp" : i % 3 === 1 ? "panLeft" : "zoomOut";
    const cameraAngle: VisualPlan["cameraAngle"] =
      beat.role === "hook" ? "wide" : beat.role === "evidence" ? "medium" : "static";
    return {
      purpose: beat.purpose,
      visualType,
      shot:
        beat.role === "hook"
          ? "لقطة افتتاحية عريضة تظهر الفكرة كاملة دون تفاصيل مشتتة"
          : beat.role === "evidence"
            ? "مجال بصري منظّم يعرض الدليل بشكل قابل للقراءة في ثانيتين"
            : "توجيه بصري يعتمد التسلسل العمودي للعناصر لتسهيل المتابعة",
      cameraAngle,
      cameraMove,
      composition:
        i % 2 === 0
          ? "تحريك مركزي مع هامش هوائي علوي للنص، عناصر تدخل بتتابع محكوم"
          : "توزيع ثالثي: النص في الثلث الأيمن والعنصر البصري يقابله",
      lighting:
        type === "documentary" || type === "story"
          ? "إضاءة درامية بتباين عالٍ (chiaroscuro) مع ظلال طويلة"
          : "إضاءة مستوية ناعمة تمنع فقدان تفاصيل النص",
      background: bg,
      transition: styleGuide.transitionLanguage[i % styleGuide.transitionLanguage.length],
      requiredAssets: [],
    };
  };
  return beats.map((beat, i) => planFor(beat, i, i === beats.length - 1));
}

export interface DirectorInput {
  idea?: string;
  script?: string;
  type?: VideoTypeId;
  style?: StyleId;
  audience?: AudienceId;
  platform?: PlatformId;
  durationSeconds: number;
}

/** الخطوات 1–5 من خط الإنتاج: تحليل المحتوى ثم البنية ثم الخطة؛ مخرجات مرتبة وقابلة للمراجعة. */
export function directProject(input: DirectorInput): DirectedPlan {
  const idea = (input.idea ?? "").trim();
  const script = (input.script ?? "").trim();
  const combined = [idea, script].filter(Boolean).join(" ");
  const inputMode: ContentAnalysis["inputMode"] = script.length >= 40 ? "script" : "idea";

  const type: VideoTypeId =
    input.type ??
    detectFrom<VideoTypeId>(
      `${combined} ${detectTopicForType(script || idea)}`,
      TYPE_HINTS,
      "educational",
    );
  const audience =
    input.audience ?? detectFrom<AudienceId>(combined, AUDIENCE_HINTS, "general");
  const platform =
    input.platform ?? detectFrom<PlatformId>(combined, PLATFORM_HINTS, VERTICAL_TYPES.includes(type) ? "reels" : "youtube");
  const vertical = VERTICAL_TYPES.includes(type) || platform === "reels" || platform === "shorts" || platform === "tiktok";
  const topic = deriveTopic(script || idea);
  const analysis: ContentAnalysis = {
    inputMode,
    type,
    audience,
    platform,
    vertical,
    topic,
    message: deriveMessage(script || idea || topic, topic),
    subIdeas: deriveSubIdeas(script || idea),
    tone: TONE_BY_TYPE[type],
    durationSeconds: input.durationSeconds,
  };
  const plan =
    inputMode === "script"
      ? planStoryboardFromScript(script, type, input.durationSeconds)
      : planStoryboard(idea, type, input.durationSeconds);
  const target = planSceneCount(input.durationSeconds);
  const beats = planNarrative(analysis, Math.max(target, plan.scenes.length));
  const styleId: StyleId = input.style ?? bestStyleFor(type);
  const styleGuide = buildStyleGuide(styleId, type);
  const visualPlans = buildVisualPlans(beats, analysis, styleGuide);
  while (visualPlans.length < plan.scenes.length) {
    visualPlans.push(visualPlans[visualPlans.length - 1]);
  }
  if (visualPlans.length > plan.scenes.length) visualPlans.length = plan.scenes.length;
  return { analysis, beats, styleGuide, visualPlans, plan };
}

function detectTopicForType(text: string): string {
  return text.slice(0, 400);
}

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

function bestStyleFor(type: VideoTypeId): StyleId {
  return STYLE_BY_TYPE[type] ?? "minimal";
}

export const DIRECTOR_NOTES_AR: Record<NarrativeBeat["role"], string> = {
  hook: "افتتاحية",
  setup: "تأطير",
  development: "تطوير",
  evidence: "دليل",
  turn: "منعطف",
  resolution: "خلاصة",
  cta: "دعوة للفعل",
};
