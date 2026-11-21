// Editable, offline template library. Each template is a function that fills
// a ProjectDoc — no external services, no AI APIs required.

import type { ProjectDoc } from "./types";
import { newDoc, uid } from "./types";
import { buildDocFromScript, PALETTES, accentShape, textLayer } from "./builder";
import type { StyleId, VideoTypeId } from "./script";
import { splitScriptIntoLines } from "./script";

export interface TemplateDef {
  id: string;
  nameAr: string;
  descAr: string;
  category: VideoTypeId;
  style: StyleId;
  build(): ProjectDoc;
}

function scene(
  doc: ProjectDoc,
  title: string,
  text: string,
  startY: number,
): void {
  // helper used inside template builders to append a scene
  doc.scenes.push({
    id: uid("scn"),
    title,
    script: text,
    duration: 6,
    background: doc.scenes[0]?.background ?? PALETTES.professional.bg,
    transitionIn: "slideUp",
    transitionDuration: 0.6,
    camera: { zoom: 1.05, panX: 0, panY: 0 },
    layers: [
      textLayer(text, {
        palette: PALETTES.professional,
        y: startY,
        font: { family: "Cairo", size: 80, weight: 800, color: PALETTES.professional.textColor },
        anim: "popIn",
        animDuration: 0.9,
      }),
      accentShape(PALETTES.professional.accent, doc.scenes.length, 0.62),
    ],
    voiceScript: text,
  });
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "youtube_intro",
    nameAr: "مقدمة قناة يوتيوب",
    descAr: "قالب افتتاحي ديناميكي مع شعار وعنوان وتأثيرات سريعة",
    category: "youtube",
    style: "professional",
    build: () => {
      const doc = newDoc("مقدمة قناة يوتيوب");
      doc.scenes = [];
      scene(doc, "الافتتاح", "مرحباً بك من جديد!", 0.4);
      scene(doc, "العنوان", "اليوم عندي مفاجأة لكم!", 0.4);
      scene(doc, "الدعوة", "اشترك وفعّل الجرس 🔔", 0.4);
      buildDocFromScript(doc, doc.scenes.map((s) => s.script), "professional", "youtube");
      return doc;
    },
  },
  {
    id: "reels_hook",
    nameAr: "ريلز عمودي سريع",
    descAr: "فيديو عمودي بإيقاع سريع مناسب لإنستغرام والتيك توك",
    category: "reels",
    style: "tech",
    build: () => {
      const doc = newDoc("ريلز سريع");
      doc.scenes = [];
      buildDocFromScript(
        doc,
        splitScriptIntoLines("معلومة صادمة!\nلن تصدق ما حدث\nالتفاصيل في الأسفل\nتابعنا للمزيد"),
        "tech",
        "reels",
      );
      doc.subtitles = [];
      return doc;
    },
  },
  {
    id: "edu_lesson",
    nameAr: "درس تعليمي",
    descAr: "قالب شرح مبسط بعناوين ورسوم بيانية",
    category: "educational",
    style: "infographic",
    build: () => {
      const doc = newDoc("درس تعليمي");
      doc.scenes = [];
      buildDocFromScript(
        doc,
        splitScriptIntoLines(
          "هل تعلم؟\nماهي الفكرة الأساسية؟\nخطوات عملية سهلة\nأخطاء يجب تجنبها\nخلاصة الدرس",
        ),
        "infographic",
        "educational",
      );
      return doc;
    },
  },
  {
    id: "finance_explainer",
    nameAr: "شرح مفهوم مالي",
    descAr: "قالب مناسب لمحتوى المال والاستثمار مع أرقام",
    category: "finance",
    style: "professional",
    build: () => {
      const doc = newDoc("شرح مالي");
      doc.scenes = [];
      buildDocFromScript(
        doc,
        splitScriptIntoLines(
          "ما معنى هذا المصطلح المالي؟\nالأرقام الحقيقية تحكي القصة\nإدارة المخاطر أولاً\nخطة عملية لخطوتك القادمة",
        ),
        "professional",
        "finance",
      );
      return doc;
    },
  },
  {
    id: "trading_tip",
    nameAr: "نصيحة تداول",
    descAr: "قالب سريع لمحتوى التداول مع الرسوم البيانية",
    category: "trading",
    style: "tech",
    build: () => {
      const doc = newDoc("نصيحة تداول");
      doc.scenes = [];
      buildDocFromScript(
        doc,
        splitScriptIntoLines(
          "قراءة الشارت في ثوانٍ!\nقاعدة إدارة المخاطر الذهبية\nمتى تدخل ومتى تخرج؟\nتداول بمسؤولية",
        ),
        "tech",
        "trading",
      );
      return doc;
    },
  },
  {
    id: "ad_promo",
    nameAr: "إعلان ترويجي",
    descAr: "قالب إعلاني مختصر مع دعوة واضحة لاتخاذ إجراء",
    category: "ad",
    style: "cinematic",
    build: () => {
      const doc = newDoc("إعلان ترويجي");
      doc.scenes = [];
      buildDocFromScript(
        doc,
        splitScriptIntoLines("هل تبحث عن الأفضل؟\nتجربة مختلفة تماماً\nجرب اليوم!\nاطلب الآن"),
        "cinematic",
        "ad",
      );
      return doc;
    },
  },
  {
    id: "documentary_open",
    nameAr: "افتتاحية وثائقية",
    descAr: "قالب هادئ ووثائقي بإضاءة دافئة",
    category: "documentary",
    style: "documentary",
    build: () => {
      const doc = newDoc("وثائقي");
      doc.scenes = [];
      buildDocFromScript(
        doc,
        splitScriptIntoLines("في البداية كان هناك سؤال...\nثم بدأت الرحلة\nالتحدي الذي غيّر كل شيء\nواليوم... تقف الحكاية أمامك"),
        "documentary",
        "documentary",
      );
      return doc;
    },
  },
  {
    id: "infographic_stats",
    nameAr: "إنفوغرافيك أرقام",
    descAr: "عرض أرقام وإحصائيات بحركة سهلة",
    category: "motion",
    style: "infographic",
    build: () => {
      const doc = newDoc("إنفوغرافيك");
      doc.scenes = [];
      buildDocFromScript(
        doc,
        splitScriptIntoLines("أرقام لا تكذب\nمقارنة سريعة\nالتطور عبر السنوات\nالخلاصة بالأرقام"),
        "infographic",
        "motion",
      );
      return doc;
    },
  },
  {
    id: "story_narrative",
    nameAr: "قصة قصيرة",
    descAr: "قالب سردي بإيقاع هادئ للقصص",
    category: "story",
    style: "minimal",
    build: () => {
      const doc = newDoc("قصة قصيرة");
      doc.scenes = [];
      buildDocFromScript(
        doc,
        splitScriptIntoLines("كل قصة لها بداية\nثم جاءت اللحظة الحاسمة\nخطوة واحدة غيّرت كل شيء\nوالنهاية... أجمل مما توقعت"),
        "minimal",
        "story",
      );
      return doc;
    },
  },
];

export function instantiateTemplate(id: string, nameAr?: string): ProjectDoc | null {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return null;
  const doc = t.build();
  doc.id = uid("prj");
  if (nameAr) doc.name = nameAr;
  return doc;
}
