// Offline Arabic script generator — a real production pipeline, not line splitting:
// idea → topic extraction → structured scene plan (title / on-screen text / voice-over /
// internal visual note) → measured durations that fit the target length.
// No user production instructions ever leak into on-screen or spoken content.

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
  { id: "trading", nameAr: "تداول" },
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
  { id: "threed", nameAr: "ثلاثي الأبعاد" },
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

export type VisualKind = "title" | "point" | "chart" | "cta";

export interface ScenePlan {
  title: string;
  onScreen: string;
  voiceover: string;
  visual: string;
  duration: number;
  kind?: VisualKind;
}

export interface VideoPlan {
  topic: string;
  scenes: ScenePlan[];
  targetSeconds: number;
}

const DIRECTIVE_VERBS = [
  "أنشئ","أوجد","اصنع","اعمل","أريد","أرغب","ساعدني","صمم","اكتب","أنتج","هيئ","هيئ",
  "ابن","تأكد","اجعل","أضف","استخدم","ضع","اختر","أحرص","ليكن",
  "أخرج","اخرج","أعرض","اعرض","اشرح","أشرح","أقدم","قدملي","أعطني","اعطني","صور","أرفق","أدرج","ادرج",
];

/** Normalize a word for matching: strip diacritics/tatweel and unify hamza forms. */
function normalizeWord(word: string): string {
  return word
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي");
}

const CONNECTOR_WORDS = ["يشمل","تشمل","يتضمن","تتضمن","يضمن","يتناول","يغطي"];
const PRODUCTION_WORDS = [
  "فيديو","موشن","جرافيك","موسيقى","تعليق صوتي","صوت مسجل","ترجمة","ترجمات",
  "أسلوب","نمط","إنفوغرافيك","سينمائي","احترافي","وثائقي","تعليمي","إعلاني","إعلان","تسويقي",
  "ثانية","ثوانٍ","ثواني","دقيقة","دقائق","مدته","مدتها","المدة",
  "رسومات","متحركة","ممتع بصرياً","ممتعًا بصريًا","لغة عربية","فقط","قصير","قصيرة","طويل","طويلة",
];

interface Angle {
  title: (topic: string) => string;
  onScreen: (topic: string) => string;
  voice: (topic: string) => string;
  visual: (topic: string) => string;
  kind: VisualKind;
}

const EXTRA_ANGLES: Angle[] = [
  {
    title: () => "لماذا الآن؟",
    onScreen: () => "لماذا الآن بالتحديد؟",
    voice: (t) => `الجواب ستناله بنفسك: كل يوم تؤجل فيه ${t} تخسر شيئاً صغيراً لا يُعوَّض لاحقاً.`,
    visual: () => "سؤال كبير مطبوع مع مؤشّر يحوم حوله ثم هرم صغير",
    kind: "point",
  },
  {
    title: () => "أخطاء شائعة",
    onScreen: () => "أشهر ثلاثة أخطاء",
    voice: (t) => `يرتكب كثير من الناس أخطاء متكررة حول ${t} دون أن يلاحظوا، وأكبرها الاعتماد على معلومات ناقصة أو عادات ورثوها دون مراجعة.`,
    visual: () => "قائمة رقمية تنكشف عنصراً بعد عنصر مع علامة تحذير",
    kind: "point",
  },
  {
    title: () => "أرقام تتحدث",
    onScreen: () => "أرقام تحكي القصة",
    voice: (t) => `الأرقام المحيطة بـ ${t} تتكلم بجلاء: قارن بين من يطبّق المعرفة الصحيحة ومن يهملها، والفارق يظهر خلال أسابيع لا سنوات.`,
    visual: () => "أعمدة بيانية صاعدة تُظهر مقارنة تفاعلية",
    kind: "chart",
  },
  {
    title: () => "خرافة ضد حقيقة",
    onScreen: () => "خرافة أم حقيقة؟",
    voice: (t) => `تنتقل حول ${t} معلومة شهيرة نصفتها الأبحاث: قسمناها لك إلى ما هو مؤكَّد وما هو مجرد خرافة متداولة.`,
    visual: () => "بطاقتان متقابلتان: واحدة تُشطب والأخرى تُعلَّم بالصح",
    kind: "point",
  },
  {
    title: () => "خطوات عملية",
    onScreen: () => "ابدأ بهذه الخطوات اليوم",
    voice: (t) => `الآن الجزء العملي: خطوات بسيطة لتطبيق ما تعلمناه حول ${t} ابتداءً من اليوم نفسه، خطوة تلو الأخرى.`,
    visual: () => "سلّم متدرّج تظهر عليه ثلاث خطوات مرقّمة",
    kind: "point",
  },
  {
    title: () => "فائدة مفاجئة",
    onScreen: () => "فائدة لم تتوقعها",
    voice: (t) => `وإليك فائدة تقلّب الصورة: تأثير ${t} يمتد إلى مجالات لا تربطها بها عادة، من مزاجك إلى إنتاجيتك اليومية.`,
    visual: () => "دائرة تتوسع تدريجياً كاشفة عناصر حولها",
    kind: "point",
  },
  {
    title: () => "خلاصة عملية",
    onScreen: () => "الخلاصة في سطرين",
    voice: (t) => `لنجمع الخيوط: ${t} ليست تفصيلاً ثانوياً بل قرار يومي صغير يتراكم أثره بثبات.`,
    visual: () => "بطاقة ملخّص تُطارق إليها النقاط السابقة",
    kind: "point",
  },
];

const introAngle = (): Angle => ({
  title: () => "البداية",
  onScreen: (t) => `${t}… لماذا يهمّك؟`,
  voice: (t) => `سواء لاحظت ذلك أم لا، ${t} حاضرة في تفاصيل يومك أكثر مما تتتصور. وفي الدقائق القادمة ستعرف السبب.`,
  visual: () => "مشهد افتتاحي: عنوان كبير في المنتصف مع شكل توضيحي مبسّط",
  kind: "title",
});

const ANGLE_BANKS: Record<VideoTypeId, Angle[]> = {
  educational: [
    introAngle(),
    {
      title: () => "ما المقصود؟",
      onScreen: () => "نبدأ من التعريف",
      voice: (t) => `لنبسّط الأمر من البداية: ${t} مفهوم أقرب إليك مما تدرك، وسنفككه خطوة خطوة دون تعقيد.`,
      visual: () => "بطاقة تعريف مع أيقونة مركزية وخطوط فاصلة",
      kind: "point",
    },
    {
      title: () => "لماذا يهم؟",
      onScreen: () => "لماذا يهمّك هذا؟",
      voice: (t) => `الجواب مباشر: فهم ${t} يوفّر عليك وقتاً وجهداً، ويجعل قراراتك اليومية أوضح وأدق.`,
      visual: () => "ثلاث أيقونات تظهر تباعاً مع نبضة لكل واحدة",
      kind: "point",
    },
    {
      title: () => "أرقام تتكلم",
      onScreen: () => "أرقام تحكي القصة",
      voice: (t) => `وإذا نظرنا إلى الأرقام، سنجد أن ${t} قصة يحكيها الإحصاء قبل أن يحكيها الكلام.`,
      visual: () => "رسم أعمدة يتصاعد مع نسب متحركة",
      kind: "chart",
    },
    {
      title: () => "كيف يعمل؟",
      onScreen: () => "كيف يعمل عملياً؟",
      voice: (t) => `عملياً، يمر ${t} بثلاث مراحل متتابعة، وكل مرحلة تمهّد التي تليها بشكل طبيعي.`,
      visual: () => "ثلاث خطوات تتحرك مع أسهم متتالية",
      kind: "point",
    },
    {
      title: () => "أخطاء شائعة",
      onScreen: () => "أخطاء يقع فيها كثيرون",
      voice: (t) => `وقبل التعمق، إنها الأخطاء الشائعة حول ${t} التي تفسد النتيجة من أولها.`,
      visual: () => "تنبيهات تُشطب تدريجياً باللون المكوّن",
      kind: "point",
    },
    {
      title: () => "خرافة أم حقيقة؟",
      onScreen: () => "خرافة أم حقيقة؟",
      voice: () => `وهناك خرافة شائعة نبدها ببساطة: الاعتقاد أن الأمر يحتاج أدوات معقدة، والحقيقة غير ذلك تماماً.`,
      visual: () => "بطاقة خرافة/حقيقة تنقلب",
      kind: "point",
    },
    {
      title: () => "مثال من الواقع",
      onScreen: () => "مثال من حياتك اليومية",
      voice: (t) => `خذ مثالاً رأيته اليوم دون أن تنتبه: ${t} كانت حاضرة فيه حضوراً كاملاً.`,
      visual: () => "مشهد يومي مصغّر مع شبكة خفيفة",
      kind: "point",
    },
    {
      title: () => "نصيحة عملية",
      onScreen: () => "نصيحة تصلح من اليوم",
      voice: (t) => `وإليك النصيحة الذهبية: جرّب تعديلاً واحداً بسيطاً في ${t} اليوم، وراقب الفرق خلال أسبوع واحد.`,
      visual: () => "بطاقة نصيحة مع لمعة تعبر الشاشة",
      kind: "point",
    },
    {
      title: () => "خلاصة",
      onScreen: () => "الخلاصة",
      voice: (t) => `وفي الخلاصة: ${t} ليست موضوعاً يُذكر ثم يُنسى، بل عادة بسيطة تصنع فرقاً واضحاً مع الوقت.`,
      visual: () => "خلاصة مرقّمة تنزل قائمة",
      kind: "point",
    },
  ],
  documentary: [
    {
      title: () => "البداية",
      onScreen: () => "قصة تبدأ من هنا",
      voice: (t) => `في مكان ما، وفي زمن لا يبعد كثيراً، كانت ${t} مجرد سؤال يسأله قوم لا يعرفون الجواب بعد.`,
      visual: () => "مشهد افتتاحي سينمائي وإضاءة دافئة",
      kind: "title",
    },
    {
      title: () => "الجذور",
      onScreen: () => "الجذور الأولى",
      voice: (t) => `بدأت الحكاية من جذورها الأولى، حيث لم يكن لـ${t} الوجود الحالي إلا بصورة أولية بسيطة.`,
      visual: () => "خط زمني أفقي مع صور مصغرة تتبدل",
      kind: "point",
    },
    {
      title: () => "التطور",
      onScreen: () => "التطور خطوة بخطوة",
      voice: (t) => `سنة بعد سنة أخذت ${t} شكلاً جديداً، حتى صارت شيئاً مختلفاً تماماً عن بدايتها.`,
      visual: () => "خط زمني يتدرج مع توهجات ضوئية",
      kind: "chart",
    },
    {
      title: () => "التحدي",
      onScreen: () => "التحدي الأول",
      voice: (t) => `لكن الطريق لم يكن مفروشاً، فقد واجهت ${t} عقبات كادت توقفها من جذورها.`,
      visual: () => "مشهد مظلم يتخلله شعاع واحد",
      kind: "point",
    },
    {
      title: () => "التحوّل",
      onScreen: () => "اللحظة التي غيّرت كل شيء",
      voice: (t) => `وفي لحظة واحدة انقلبت الأمور: تحوّل بسيط غيّر مسار ${t} إلى الأبد.`,
      visual: () => "انفجار ضوئي وتبدل الألوان",
      kind: "point",
    },
    {
      title: () => "الأثر",
      onScreen: () => "الأثر الذي نراه اليوم",
      voice: (t) => `واليوم، تشعر بآثار ${t} في بيتك وشارعك ومدينتك من دون أن تعرف مصدرها.`,
      visual: () => "مشاهد متتابعة تتجمع في شبكة واحدة",
      kind: "point",
    },
    {
      title: () => "الغد",
      onScreen: () => "وماذا بعد؟",
      voice: (t) => `أما ما هو قادم، فتلك رحلة لم تنتهِ بعد؛ ${t} في بدايتها الحقيقية الآن.`,
      visual: () => "أفق مفتوح مع أشرطة تسريع",
      kind: "point",
    },
  ],
  story: [
    {
      title: () => "البداية",
      onScreen: () => "في يوم عادي…",
      voice: (t) => `في يوم عادي جداً، لم يكن أحد يعلم أن ${t} ستكون بداية حكاية لم تكن عادية أبداً.`,
      visual: () => "مشهد هادئ بلون خافت وحركة سحب",
      kind: "title",
    },
    {
      title: () => "اللحظة المفصلية",
      onScreen: () => "اللحظة المفصلية",
      voice: () => `ثم حدث ما لا يُتوقع؛ حادثة صغيرة فتحت باباً لا يُغلق مرة أخرى.`,
      visual: () => "وميض ضوئي يغيّر الإضاءة",
      kind: "point",
    },
    {
      title: () => "التحدي",
      onScreen: () => "التحدي",
      voice: () => `لكن التحدي كان أصعب مما بدا، فلم تكن الشجاعة وحدها هي المطلوب.`,
      visual: () => "عوائق رمادية تتلاشى تدريجياً",
      kind: "point",
    },
    {
      title: () => "القرار",
      onScreen: () => "قرار واحد صغير",
      voice: (t) => `وفي قلب الحكاية، عُقد قرار واحد صغير حول ${t} أعطى القصة وجهها الحقيقي.`,
      visual: () => "بطاقة قرار تتحول من رمادي إلى ذهبي",
      kind: "point",
    },
    {
      title: () => "النهاية",
      onScreen: () => "نهاية لم تكن متوقعة",
      voice: () => `وفي النهاية، بقيت الحكاية تُروى… وماذا كنت ستفعل أنت لو كنت في مكانها؟`,
      visual: () => "مشهد ختامي بعنوان يتلاشى بهدوء",
      kind: "cta",
    },
  ],
  ad: [
    {
      title: () => "الافتتاح",
      onScreen: () => "لحظة واحدة من وقتك",
      voice: (t) => `لحظة واحدة من وقتك، ولنجرب شيئاً مختلفاً تماماً حول ${t}.`,
      visual: () => "مشهد افتتاحي سريع مع شعار بارز",
      kind: "title",
    },
    {
      title: () => "الوعد",
      onScreen: () => "وعد نُلبيه",
      voice: (t) => `وعدنا بسيط: ${t} جاهزة أمامك دون أن تفقد دقيقة واحدة في التعقيد.`,
      visual: () => "بطاقة وعد مع نموّ متحرك",
      kind: "point",
    },
    {
      title: () => "التميّز",
      onScreen: () => "ما الذي يميّزه؟",
      voice: () => `السرعة في التنفيذ وسهولة كل خطوة، وبأسعار تناسب الجميع فعلاً.`,
      visual: () => "عدادات تسارع وأرقام متدفقة",
      kind: "point",
    },
    {
      title: () => "الإثبات",
      onScreen: () => "الأرقام لا تُجادل",
      voice: () => `والنتائج تتكلم: أرقام تتصاعد كل أسبوع، ونتائج لا تُجادل.`,
      visual: () => "رسم بياني صاعد مع نقاط إثبات",
      kind: "chart",
    },
    {
      title: () => "ثقة العملاء",
      onScreen: () => "آلاف جرّبوا ووافقوا",
      voice: () => `آلاف العملاء جرّبوا ووافقوا، ومواقفهم الحقيقية تصنع ثقة أكبر من أي كلام.`,
      visual: () => "أيقونات عملاء تتكاثر مع نبضات",
      kind: "point",
    },
    {
      title: () => "الدعوة",
      onScreen: () => "ابدأ الآن",
      voice: (t) => `الفرصة أمامك، وتكلفة التأجيل أعلى مما تتخيل. ${t}… بُنيت لتحسم القرار اليوم، لا بعد أشهر.`,
      visual: () => "زر دعوة كبير ينبض",
      kind: "cta",
    },
  ],
  motion: [
    introAngle(),
    {
      title: () => "الفكرة",
      onScreen: () => "الفكرة في سطر",
      voice: (t) => `الفكرة بسيطة: ${t} تحتاج نظرة جديدة فقط، والبساطة هي أداة الوصول إليها.`,
      visual: () => "أشكال هندسية تتشكل مع حركة نظيفة",
      kind: "point",
    },
    {
      title: () => "كيف يعمل",
      onScreen: () => "كيف يعمل عملياً",
      voice: () => `عملياً، نتقدّم خطوة بخطوة، ونبرز التفاصيل المهمة أثناء الحركة لا بعدها.`,
      visual: () => "خطوات تتحرك على خط زمني",
      kind: "point",
    },
    {
      title: () => "الأثر",
      onScreen: () => "الأثر الكبير",
      voice: () => `والنتيجة أثر واضح يلمسه المشاهد في التفاصيل الصغيرة قبل الكبيرة.`,
      visual: () => "تكبير تراكمي على عناصر متتالية",
      kind: "point",
    },
    {
      title: () => "الخاتمة",
      onScreen: () => "الخلاصة",
      voice: () => `وهذا كل شيء — الفكرة وصلت، والتفاصيل كلها بين يديك الآن.`,
      visual: () => "خاتمة نظيفة مع شكل يتلاشى",
      kind: "cta",
    },
  ],
  youtube: [
    {
      title: () => "الترحيب",
      onScreen: () => "أهلاً بك من جديد!",
      voice: (t) => `أهلاً بكم! في فيديو اليوم نتكلم عن ${t}، وسيفاجئك جزء من الخاتمة بلا شك.`,
      visual: () => "مشهد ترحيب حيوي مع مقدمة نسقية",
      kind: "title",
    },
    {
      title: () => "الوعد",
      onScreen: () => "تابع حتى النهاية!",
      voice: (t) => `تابع معنا حتى النهاية، لأن معلومة واحدة في ذيل ${t} قد تغيّر الكثير.`,
      visual: () => "سهم يشير إلى شريط التقدم",
      kind: "point",
    },
    {
      title: () => "النقطة الأولى",
      onScreen: () => "النقطة الأولى",
      voice: (t) => `لنبدأ من البداية الصحيحة: ${t} تحتاج زاوية أخرى لتُفهم على أكمل وجه.`,
      visual: () => "بطاقة مرقّمة مع لمعة",
      kind: "point",
    },
    {
      title: () => "التجربة العملية",
      onScreen: () => "تجربة عملية مباشرة",
      voice: () => `في التجربة العملية، جربنا الأمر بالحرف الواحد وشاهدنا النتيجة مباشرة.`,
      visual: () => "شاشتان توضحان قبل وبعد",
      kind: "point",
    },
    {
      title: () => "المفاجأة",
      onScreen: () => "مفاجأة النهاية!",
      voice: () => `وكان هذا قبيل المفاجأة… إذ المعلومة المهمة لم تظهر إلا الآن.`,
      visual: () => "مشهد مفاجأة مع تحول لوني حاد",
      kind: "point",
    },
    {
      title: () => "الخاتمة",
      onScreen: () => "شارك ورأيك!",
      voice: () => `شكراً على المشاهدة! اكتب رأيك في التعليقات، وفعّل الجرس ليصلك كل جديد.`,
      visual: () => "أزرار اشتراك متحركة",
      kind: "cta",
    },
  ],
  reels: [
    {
      title: () => "الافتتاح",
      onScreen: () => "٣ حقائق سريعة!",
      voice: (t) => `ثلاث حقائق سريعة عن ${t} تجعلها أعمق مما تظن.`,
      visual: () => "افتتاح سريع مع عدّاد ثلاثي",
      kind: "title",
    },
    {
      title: () => "الحقيقة الأولى",
      onScreen: () => "أولاً — ليس كما تتخيل",
      voice: (t) => `أولاً: ${t} ليست كما تتوقع، فأساسياتها تفتح مجالاً أوسع.`,
      visual: () => "بطاقة مرقّمة تنزلق",
      kind: "point",
    },
    {
      title: () => "الحقيقة الثانية",
      onScreen: () => "ثانياً — المعلومة الغائبة",
      voice: () => `ثانياً: المعلومة التي لا يذكرها أحد تقريباً، وهي الأهم في الاستخدام اليومي.`,
      visual: () => "عنصر مخفي يظهر",
      kind: "point",
    },
    {
      title: () => "الحقيقة الثالثة",
      onScreen: () => "ثالثاً — نصيحة أنجح",
      voice: () => `ثالثاً: نصيحة أنجحت في تجارب كثيرة من اليوم الأول.`,
      visual: () => "بطاقة نصيحة وامضة",
      kind: "point",
    },
    {
      title: () => "الخاتمة",
      onScreen: () => "تابعنا للمزيد!",
      voice: () => `تابعنا، وشارك المعلومة التي أعجبتك أكثر.`,
      visual: () => "خاتمة سريعة مع أزرار",
      kind: "cta",
    },
  ],
  finance: [
    {
      title: () => "الافتتاح",
      onScreen: () => "قبل أي قرار مالي",
      voice: (t) => `قبل أن تحسم أي قرار مالي، أحبّ أن تعرف هذه الحقائق عن ${t}.`,
      visual: () => "خلفية مالية هادئة مع أرقام",
      kind: "title",
    },
    {
      title: () => "الأساسيات",
      onScreen: () => "الأساسيات أولاً",
      voice: (t) => `لنبدأ بالأساسيات: ${t} تدور حول مساحة واضحة من القواعد، وفهمها الصحيح يغني عن الكثير.`,
      visual: () => "أيقونات مالية تظهر تباعاً",
      kind: "point",
    },
    {
      title: () => "المخاطر",
      onScreen: () => "المخاطر بصدق",
      voice: () => `ولا نتجاهل المخاطر: كل فرصة تحمل وجهها الآخر، والحساب المسبق نصيحة دائمة.`,
      visual: () => "مؤشرات تحذير متحركة",
      kind: "point",
    },
    {
      title: () => "الخطة",
      onScreen: () => "خطة واضحة",
      voice: () => `والحل خطة واضحة توزع الحقوق بين الدخل والمصروف والاستثمار بشكل متوازن.`,
      visual: () => "مخطط ينزلق مع تقسيمات",
      kind: "chart",
    },
    {
      title: () => "الخاتمة",
      onScreen: () => "قراراتك اليوم أمانك غداً",
      voice: () => `تذكّر: قراراتك المالية اليوم هي أمانك غداً… وهذا ليس نصيحة استثمارية.`,
      visual: () => "خاتمة حكيمة مع توقيع",
      kind: "cta",
    },
  ],
  trading: [
    {
      title: () => "الافتتاح",
      onScreen: () => "من الفكرة إلى التنفيذ",
      voice: (t) => `${t} رحلة من الفكرة إلى التنفيذ، وهي مشروطة بقواعد صارمة وتوقيتات دقيقة.`,
      visual: () => "مشهد شارت سينمائي وإضاءة داكنة",
      kind: "title",
    },
    {
      title: () => "قراءة الشارت",
      onScreen: () => "اقرأ الشارت بسرعة",
      voice: () => `الخطوة الأولى: قراءة الشارت بسرعة مع منطق واضح لحركة السعر.`,
      visual: () => "شارت مع نقاط دخول متوهجة",
      kind: "point",
    },
    {
      title: () => "إدارة المخاطر",
      onScreen: () => "احمِ رأس مالك",
      voice: () => `الخطوة الثانية: إدارة المخاطر أولاً، فبدونها لا يعيش التداول طويلاً.`,
      visual: () => "درع يتحرك حول رأس المال",
      kind: "point",
    },
    {
      title: () => "خطة التداول",
      onScreen: () => "خطة الدخول والخروج",
      voice: () => `والخطوة الثالثة: خطة تداول بمحددات واضحة تدخل وتخرج في مواعيدها.`,
      visual: () => "خطتا دخول وخروج على الشارت",
      kind: "point",
    },
    {
      title: () => "الخاتمة",
      onScreen: () => "تداول بمسؤولية",
      voice: () => `التداول خبرة حقيقية، فتذكّر: تداول بمسؤولية وأدِر مخاطرك دائماً.`,
      visual: () => "خاتمة حكيمة",
      kind: "cta",
    },
  ],
};

export function planSceneCount(targetSeconds: number): number {
  const s = Math.max(10, Math.min(900, targetSeconds));
  if (s <= 12) return Math.max(2, Math.round(s / 5));
  if (s <= 25) return Math.max(3, Math.min(5, Math.round(s / 6)));
  if (s <= 45) return Math.max(4, Math.min(6, Math.round(s / 7)));
  if (s <= 75) return Math.max(6, Math.min(9, Math.round(s / 9)));
  if (s <= 240) return Math.max(10, Math.min(18, Math.round(s / 13.5)));
  return Math.max(18, Math.min(30, Math.round(s / 17)));
}

/** Speech-rate duration estimate: Arabic voice-over ≈ 2.3 words/sec + breathing room. */
export function estimateDurationFromText(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(2.2, 0.8 + words / 2.3);
}

/** Extract the actual topic from the user idea, discarding all production instructions. */
const ARABIC_LETTER = /[^\u0621-\u064A]/g;
const DURATION_JUNK = /\s*(?:لمدة|لن|مدة|مدته|مدتها)\s*[\d\u0660-\u06690-9]*\s*(?:ثانية|ثوانٍ|ثوانى|دقيقة|دقائق)?/g;

function scrubClause(clause: string): string {
  const kept: string[] = [];
  const words = clause.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const bare = word.replace(ARABIC_LETTER, "");
    if (!bare) {
      if (/^[\d\u0660-\u0669]+$/.test(word)) continue;
      kept.push(word);
      continue;
    }
    const norm = normalizeWord(word);
    if (DIRECTIVE_VERBS.some((v) => norm.includes(normalizeWord(v)))) continue;
    if (PRODUCTION_WORDS.some((p) => {
        const np = normalizeWord(p.split(" ")[0]);
        return np.length > 2 && (norm.includes(np) || (norm.length > 2 && np.includes(norm)));
      })) continue;
    if (CONNECTOR_WORDS.some((c) => norm === normalizeWord(c))) {
      if (kept.length && i + 1 < words.length) kept.push("\u0648");
      continue;
    }
    kept.push(word);
  }
  return kept
    .join(" ")
    .replace(/\s+\u0648\s+/g, " \u0648")
    .replace(/^(?:\u0639\u0646|\u062d\u0648\u0644|\u0641\u064a\s*\u0634\u0623\u0646|\u0628\u0634\u0623\u0646|\u0641\u0643\u0631\u0629|\u0645\u0648\u0636\u0648\u0639)\s+/, "")
    .replace(DURATION_JUNK, " ")
    .trim();
}

export function deriveTopic(idea: string): string {
  const raw = idea.trim().replace(/\s+/g, " ");
  if (!raw) return "\u0627\u0644\u0645\u0648\u0636\u0648\u0639";
  const clauses = raw.split(/[.,\u060C\u061B:!\u061F?\n]+/).map((c) => c.trim()).filter(Boolean);
  let best = "";
  let bestScore = 0;
  for (const clause of clauses) {
    const scrubbed = scrubClause(clause);
    if (scrubbed.length > bestScore) {
      bestScore = scrubbed.length;
      best = scrubbed;
    }
  }
  let topic = best || scrubClause(clauses[0] ?? raw) || raw;
  topic = topic
    .replace(/^(?:\u0639\u0646|\u062d\u0648\u0644|\u0628\u0634\u0623\u0646)\s+/, "")
    .replace(/(?:\s|^)\S(?:\s|$)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const words = topic.split(/\s+/).filter((w) => w.length > 2);
  topic = words.join(" ");
  if (words.length > 8) topic = words.slice(0, 8).join(" ");
  if (!topic || topic.length < 3) {
    const fallback = raw.split(/\s+/).filter((w) => w.length > 2).slice(0, 6).join(" ");
    topic = fallback || "\u0627\u0644\u0645\u0648\u0636\u0648\u0639";
  }
  return topic;
}

/** Normalize scene durations so their sum stays close to the requested duration. */
export function scaleDurations(scenes: ScenePlan[], targetSeconds: number): void {
  const rawTotal = scenes.reduce((a, s) => a + s.duration, 0);
  if (!rawTotal || scenes.length === 0) return;
  const factor = targetSeconds / rawTotal;
  for (const scene of scenes) {
    const scaled = Math.max(2.2, Math.min(30, scene.duration * factor));
    scene.duration = Math.round(scaled * 10) / 10;
  }
  const drift = targetSeconds - scenes.reduce((a, s) => a + s.duration, 0);
  if (scenes.length && Math.abs(drift) > 0.4) {
    const mid = Math.floor(scenes.length / 2);
    const adjusted = Math.max(2.2, Math.min(30, scenes[mid].duration + drift));
    scenes[mid].duration = Math.round(adjusted * 10) / 10;
  }
}

/** Storyboard from a user-written script: keep the user's own sentences verbatim, no rephrasing. */
export function planStoryboardFromScript(script: string, _type: VideoTypeId, targetSeconds: number): VideoPlan {
  const topic = deriveTopic(script);
  const maxCount = planSceneCount(targetSeconds) * 2;
  const lines = splitScriptIntoLines(script)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 8)
    .slice(0, maxCount);
  const target = planSceneCount(targetSeconds);
  const parts: string[] = [...lines];
  let guard = maxCount * 2;
  while (parts.length < target && guard > 0 && splitLongestPart(parts)) guard -= 1;
  const scenes: ScenePlan[] = parts.map((line, i) => ({
    title: line.split(/\s+/).slice(0, 5).join(" ").replace(/^[,:\u060C-]+/, "").trim() || `${i + 1}`,
    onScreen: line.length > 72 ? `${line.slice(0, 72).trim()}…` : line,
    voiceover: line,
    visual: "",
    duration: 0,
    kind: i === 0 ? "title" : i === parts.length - 1 ? "cta" : "point",
  }));
  scaleDurations(scenes, targetSeconds);
  return { topic, scenes, targetSeconds };
}

/** Split the longest line at its most balanced clause break — segmentation, never rewording. */
function splitLongestPart(parts: string[]): boolean {
  let idx = -1;
  let bestWords = 8;
  parts.forEach((line, i) => {
    const words = line.split(/\s+/).filter(Boolean).length;
    if (words > bestWords) {
      idx = i;
      bestWords = words;
    }
  });
  if (idx < 0) return false;
  const line = parts[idx];
  const commas = [...line.matchAll(/\u060C/g)]
    .map((m) => m.index ?? -1)
    .filter((i) => i > 2 && i < line.length - 4);
  if (commas.length > 0) {
    const mid = line.length / 2;
    const cut = commas.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a)) + 1;
    const first = line.slice(0, cut).trim().replace(/\s+$/, "");
    const second = line.slice(cut).trim().replace(/^[\s\u060C]+/, "");
    if (first && second) {
      parts.splice(idx, 1, first, second);
      return true;
    }
  }
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;
  const splitAt = Math.max(3, Math.round(words.length * 0.6));
  parts.splice(idx, 1, words.slice(0, splitAt).join(" "), words.slice(splitAt).join(" "));
  return true;
}

/** Full structured storyboard plan from a plain user idea. Each scene is unique - no repetition. */
export function planStoryboard(idea: string, type: VideoTypeId, targetSeconds: number): VideoPlan {
  const topic = deriveTopic(idea);
  const count = planSceneCount(targetSeconds);
  const bank = ANGLE_BANKS[type] ?? ANGLE_BANKS.educational;
  const intro: Angle = bank[0];
  const outro: Angle = bank[bank.length - 1];
  const middle: Angle[] = [...bank.slice(1, bank.length - 1), ...EXTRA_ANGLES];

  const scenes: ScenePlan[] = [];
  const seen = new Set<string>();
  const budget = Math.max(4, count) * 2 + middle.length;
  const push = (angle: Angle): boolean => {
    const plan: ScenePlan = {
      title: sanitizeContent(angle.title(topic)),
      onScreen: sanitizeContent(angle.onScreen(topic)),
      voiceover: sanitizeContent(angle.voice(topic)),
      visual: sanitizeContent(angle.visual(topic)),
      duration: 0,
      kind: angle.kind,
    };
    const key = `${plan.onScreen}|${plan.voiceover}`;
    if (seen.has(key) || !plan.onScreen || !plan.voiceover) return false;
    seen.add(key);
    plan.duration = estimateDurationFromText(plan.voiceover);
    scenes.push(plan);
    return true;
  };

  push(intro);
  let a = 0;
  while (scenes.length < Math.max(1, count - 1) && a < budget && middle.length > 0) {
    push(middle[a % middle.length]);
    a += 1;
  }
  if (scenes.length < count && !seen.has(`${scenes.find((s) => s.kind === "cta")?.onScreen ?? ""}|`)) push(outro);
  while (scenes.length < count && a < budget && middle.length > 0) {
    push(middle[a % middle.length]);
    a += 1;
  }
  if (scenes.length > count) scenes.length = count;
  scaleDurations(scenes, targetSeconds);
  return { topic, scenes, targetSeconds };
}

/** Regenerate one scene plan by its position without touching the rest. */
export function regenerateScenePlan(
  idea: string,
  type: VideoTypeId,
  index: number,
  count: number,
  variant = 0,
): ScenePlan | null {
  const plan = planStoryboard(idea, type, count);
  const pool = plan.scenes;
  const base = pool.length;
  if (!base) return null;
  return pool[(index + Math.abs(variant)) % base] ?? pool[base - 1] ?? null;
}

const LEAK_PATTERNS: RegExp[] = [
  /أنشئ(er)?\s*(فيديو)?|أوجد|اصنع|اعمل\s*لي|صمم\s|اكتب|أنتج|هيّئ|ابنِ\s|تأكد|اجعل|أضف|استخدم|ضَع\s|اضع|اختر|احرص/,
  /(?:بأسلوب|بنمط|بيئة)\s*[\u0600-\u06FF]+/,
  /(?:فيديو|موشن[ ص]*جرافيك|موسيقى|تعليق الصوتي|مصورة)/,
  /(?:مدته|مدتها|مده|والمدة)\s*[\d٫.]*\s*(?:ثانية|ثوانٍ|ثواني|دقيقة|دقائق)?/,
];

export function sanitizeContent(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  for (const pattern of LEAK_PATTERNS) out = out.replace(pattern, "");
  out = out.replace(/،\s*،/g, "،").replace(/\s{2,}/g, " ").trim();
  out = out.replace(/^[،,:\-–\s]+/, "");
  return out.trim() || text.trim();
}

export interface GeneratedScript {
  lines: string[];
  titles: string[];
}

/** Back-compat wrapper: returns the voice-over lines of a structured plan. */
export function generateArabicScript(subject: string, type: VideoTypeId, targetSeconds: number): GeneratedScript {
  const plan = planStoryboard(subject, type, targetSeconds);
  return {
    lines: plan.scenes.map((s) => s.voiceover),
    titles: plan.scenes.map((s) => s.title),
  };
}

/** Split an explicitly user-written script into scene lines (text mode only). */
export function splitScriptIntoLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[\d\-•*\s]+/, "").trim())
    .filter((l) => l.length > 2);
}
