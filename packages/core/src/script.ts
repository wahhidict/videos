// Offline Arabic script generator — works without any AI service.
// Also parses AI output (from optional Ollama) into scenes.

import type { Scene } from "./types";

export type VideoTypeId =
  | "educational"
  | "documentary"
  | "story"
  | "ad"
  | "motion"
  | "youtube"
  | "reels"
  | "finance"
  | "trading";

export const VIDEO_TYPES: { id: VideoTypeId; nameAr: string }[] = [
  { id: "educational", nameAr: "تعليمي" },
  { id: "documentary", nameAr: "وثائقي" },
  { id: "story", nameAr: "قصصي" },
  { id: "ad", nameAr: "إعلاني" },
  { id: "motion", nameAr: "موشن جرافيك" },
  { id: "youtube", nameAr: "يوتيوب" },
  { id: "reels", nameAr: "ريلز" },
  { id: "finance", nameAr: "محتوى مالي" },
  { id: "trading", nameAr: "محتوى تداول" },
];

export type StyleId =
  | "cinematic"
  | "professional"
  | "threed"
  | "infographic"
  | "minimal"
  | "tech"
  | "documentary";

export const VISUAL_STYLES: { id: StyleId; nameAr: string }[] = [
  { id: "cinematic", nameAr: "سينمائي" },
  { id: "professional", nameAr: "احترافي" },
  { id: "threed", nameAr: "ثلاثي الأبعاد بأسلوب بصري" },
  { id: "infographic", nameAr: "إنفوغرافيك" },
  { id: "minimal", nameAr: "بسيط وأنيق" },
  { id: "tech", nameAr: "تقني" },
  { id: "documentary", nameAr: "وثائقي" },
];

export const DURATIONS: { id: string; nameAr: string; seconds: number | null }[] = [
  { id: "30s", nameAr: "30 ثانية", seconds: 30 },
  { id: "1m", nameAr: "دقيقة", seconds: 60 },
  { id: "3m", nameAr: "3 دقائق", seconds: 180 },
  { id: "5m", nameAr: "5 دقائق", seconds: 300 },
  { id: "10m", nameAr: "10 دقائق", seconds: 600 },
  { id: "15m", nameAr: "15 دقيقة", seconds: 900 },
  { id: "custom", nameAr: "مدة مخصصة", seconds: null },
];

interface ScriptTemplate {
  hook: (s: string) => string;
  intro: (s: string) => string;
  points: ((s: string) => string)[];
  outro: (s: string) => string;
}

const TEMPLATES: Record<VideoTypeId, ScriptTemplate> = {
  educational: {
    hook: (s) => `هل تريد أن تفهم ${s} فقط؟`,
    intro: (s) => `في هذا الدرس سنشرح ${s} بطريقة بسيطة وواضحة`,
    points: [
      (s) => `أولاً: ما المقصود بـ${s}؟`,
      (s) => `ثانياً: لماذا يهم ${s} في حياتنا اليومية؟`,
      (s) => `ثالثاً: خطوات عملية لتطبيق ${s} بشكل صحيح`,
      (s) => `أخطاء شائعة يجب تجنبها عند الحديث عن ${s}`,
    ],
    outro: (s) => `بهذا تكون قد تعرفت على أساسيات ${s}. شاهد الدروس القادمة لمزيد من التفاصيل`,
  },
  documentary: {
    hook: (s) => `قصة ${s} تبدأ من هنا...`,
    intro: (s) => `منذ فترة طويلة، كان ${s} جزءاً لا يُنسى من العالم من حولنا`,
    points: [
      (s) => `البداية: كيف نشأ ${s} وتطور عبر السنوات`,
      (s) => `التحديات: العوائق التي واجهت ${s} في طريقه`,
      (s) => `التحول: اللحظات التي غيّرت مسار ${s} إلى الأبد`,
      (s) => `اليوم: أين يقف ${s} الآن وماذا بعد؟`,
    ],
    outro: (s) => `وهكذا تُروى قصة ${s}... رحلة لا تنتهي`,
  },
  story: {
    hook: () => `كان هناك من يبحث عن شيء لم يكن يعرفه بعد...`,
    intro: () => `في يومٍ عادي، بدأت حكاية لم تكن عادية`,
    points: [
      () => `نقطة التحوّل: حدث شيء غيّر كل شيء`,
      () => `العقبة: بدا كل شيء مفقوداً للوهلة الأولى`,
      () => `القرار: خطوة واحدة صغيرة صنعت الفرق`,
      () => `النهاية الجميلة: لم يكن ما كان يبحث عنه الأخير أبداً`,
    ],
    outro: () => `وتبقى الحكاية تُحكى... ماذا كان ستفعل أنت؟`,
  },
  ad: {
    hook: () => `هل تبحث عن الأفضل؟`,
    intro: () => `نقدّم لك تجربة مختلفة تماماً`,
    points: [
      () => `سرعة لا مثيل لها وتصميم يبهر`,
      () => `سهولة في كل خطوة وبأسعار تناسب الجميع`,
      () => `آلاف العملاء جربوا ووافقوا`,
    ],
    outro: () => `اطلب الآن ولا تفوّت الفرصة!`,
  },
  motion: {
    hook: () => ` وصف بخط بسيط وأنيق`,
    intro: () => `لنبدأ من الأساسيات`,
    points: [
      (s) => `الفكرة: ${s} في جملة واحدة`,
      () => `كيف يعمل ذلك عملياً؟`,
      () => `الأثر الكبير للتفاصيل الصغيرة`,
    ],
    outro: () => `استعملت النقاط المفتاحية فقط لتوصيل الفكرة`,
  },
  youtube: {
    hook: (s) => `مرحباً بكم! في الفيديو اليوم نتحدث عن ${s}`,
    intro: (s) => `قبل أن نبدأ تابع معنا حتى النهاية لأن معلومة صغيرة عن ${s} قد تغير الكثير`,
    points: [
      (s) => `النقطة الأولى: ${s} مثالاً واضحاً`,
      () => `النقطة الثانية: تجربة عملية مباشرة`,
      () => `النقطة الثالثة: ما لا يخبرك به أحد`,
      () => `مفاجأة النهاية!`,
    ],
    outro: () => `شكراً لمشاهدتكم! اشترك في القناة وفعل الجرس ليصلك كل جديد`,
  },
  reels: {
    hook: (s) => `3 معلومات صادمة عن ${s}!`,
    intro: () => `سريعاً سريعاً`,
    points: [
      (s) => `أولاً: ${s} ليست كما تتصور`,
      () => `ثانياً: المعلومة التي لا يذكرها أحد`,
      () => `ثالثاً: النصيحة الأهم`,
    ],
    outro: () => `تابعنا لتفقد المزيد!`,
  },
  finance: {
    hook: (s) => `ما يجب أن تعرفه عن ${s} قبل أي قرار مالي`,
    intro: (s) => `${s} مصطلح تدور حوله أسئلة كثيرة، واليوم نجيب عليها جميعاً`,
    points: [
      () => `الأساسيات: كيف تُقام العمليات وأين وشاهدنا`,
      () => `المخاطر: تحسباً لكل الاحتمالات`,
      () => `خطة واضحة: الادخار والاستثمار بشكل متوازن`,
      () => `مؤشرات مهمة تتبعها باستمرار`,
    ],
    outro: () => `تذكّر: قراراتك المالية اليوم هي أمانك غداً. هذا ليس نصيحة استثمارية`,
  },
  trading: {
    hook: (s) => `${s} من حيث الفكرة إلى التنفيذ`,
    intro: (s) => `${s} يتطلب قواعد صارمة وتوقيتات دقيقة، سنشرح كل ذلك خطوة بخطوة`,
    points: [
      () => `قراءة الشارت: كيف تفهم السعر بسرعة`,
      () => `إدارة المخاطر: احمي رأس مالك قبل أي شيء`,
      () => `خطة التداول: الدخول والخروج بأرقام محددة`,
      () => `ضبط النفس: أهم أداة في التداول الناجح`,
    ],
    outro: () => `التداول يحمل مخاطر حقيقية. تداول بمسؤولية وأدِر مخاطرك دائماً`,
  },
};

export interface GeneratedScript {
  lines: string[];
  titles: string[];
}

/** Build an Arabic draft script for a subject, type, and target duration. Does not require AI. */
export function generateArabicScript(
  subject: string,
  type: VideoTypeId,
  targetSeconds: number,
): GeneratedScript {
  const tpl = TEMPLATES[type];
  const clean = subject.trim() || "الموضوع";
  const lines = [
    tpl.hook(clean),
    tpl.intro(clean),
    ...tpl.points.map((f) => f(clean)),
    tpl.outro(clean),
  ];
  // Scale the number of scenes by target duration: one scene ≈ 8–14 seconds.
  const desiredScenes = Math.max(3, Math.min(24, Math.round(targetSeconds / 12)));
  let finalLines = [...lines];
  const titles = lines.map((line) => extractTitle(line));
  while (finalLines.length < desiredScenes) {
    finalLines = finalLines.flatMap((line, i) => {
      const extra = expandLine(line, clean, i);
      return extra ? [line.split(" ").slice(0, Math.ceil(line.split(" ").length / 2)).join(" ") || line, extra] : [line];
    });
    if (finalLines.length > desiredScenes) break;
    if (finalLines.every((l) => !expandLine(l, clean, 0))) break;
  }
  return { lines: finalLines, titles: finalLines.map((l) => extractTitle(l)) };
}

function expandLine(line: string, subject: string, i: number): string | null {
  if (i % 2 === 0) {
    return `تفصيل مهم: ${line.replace(/^(أولاً|ثانياً|ثالثاً)[:：]?\s*/, "")} ويستحق التوقف قليلاً عنده حول ${subject}`;
  }
  return `مثال سريع يوضح ذلك ويقرب الفكرة لكل مشاهدين ${subject}`;
}

function extractTitle(line: string): string {
  const short = line.split(/[،,,:.،؟!]/)[0] ?? line;
  const words = short.split(/\s+/).slice(0, 6).join(" ");
  return words || "مشهد";
}

/** Convert AI-generated or template script to scenes-ready script headers. */
export function splitScriptIntoLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[\d\-\•\*\s]+/, "").trim())
    .filter((l) => l.length > 2);
}
