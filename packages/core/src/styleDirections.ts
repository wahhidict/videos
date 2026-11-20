// هوية الإخراج لكل نمط — لغة انتقالات، توقيع حركة، إضاءة، وانحياز كاميرا مستقلة عن ألوان الأنماط.

import type { MotionPresetId, SceneTransitionId } from "./types";
import type { StyleId } from "./script";

/**
 * هوية الإخراج لكل نمط — ليست ألواناً فقط:
 * لغة انتقالات، توقيع حركة، إضاءة، وانحياز كاميرا. يُلوّن النمط الصورة أما النوع (documentary/ad) فيقود النبرة والبنية.
 */
export interface StyleDirection {
  transitions: SceneTransitionId[];
  motion: MotionPresetId[];
  lighting: string;
  cameraBias: import("./director").VisualPlan["cameraMove"][];
  grammarAr: string;
}

export const STYLE_DIRECTIONS: Record<StyleId, StyleDirection> = {
  cinematic: {
    transitions: ["fade", "zoomIn", "fade"],
    motion: ["fadeInUp", "blurIn", "scaleUp"],
    lighting: "إضاءة درامية بتباين عالٍ (chiaroscuro)، ظلال طويلة، هوائية سينمائية بعد خلفية داكنة",
    cameraBias: ["zoomIn", "driftUp", "zoomOut"],
    grammarAr: "أسلوب سينمائي: لقطات واسعة، انتقالات ناعمة أصيلة، حركة كاميرا بطيئة محكومة",
  },
  professional: {
    transitions: ["slideUp", "fade", "slideUp"],
    motion: ["fadeInUp", "scaleUp", "typewriter"],
    lighting: "إضاءة مستوية ناعمة عالية المفتاح تحفظ قراءة النص دون ظلال قاتمة",
    cameraBias: ["still", "panLeft", "still"],
    grammarAr: "أسلوب احترافي: تنظيم محكم، عناصر تدخل بتتابع، تنبض ثقة ومصداقية",
  },
  threed: {
    transitions: ["zoomIn", "slideLeft", "zoomIn"],
    motion: ["popIn", "bounceIn", "rotateIn"],
    lighting: "إضاءة ثلاثية بمفتاح حاد مع حواف متوهجة (rim light) وانعكاسات لامعة",
    cameraBias: ["zoomIn", "zoomOut", "driftUp"],
    grammarAr: "أسلوب ثلاثي الأبعاد: عناصر منبثقة بإحساس عمق، دوران خفيف، انسيابية حركية",
  },
  infographic: {
    transitions: ["wipeRight", "slideUp", "wipeRight"],
    motion: ["typewriter", "wipeIn", "popIn"],
    lighting: "إضاءة مسطحة موحدة على خلفية ورقية — لا ظلال تقريباً حفاظاً على قراءة الأرقام",
    cameraBias: ["still", "still", "panLeft"],
    grammarAr: "أسلوب إنفوغرافيك: أرقام بارزة، عناصر توضيحية مؤطرة، إيقاع منظم محكوم",
  },
  minimal: {
    transitions: ["fade", "none", "fade"],
    motion: ["fadeIn", "fadeInUp"],
    lighting: "إضاءة هادئة منتشرة على خلفية بسيطة — انتباه مصروف على المحتوى",
    cameraBias: ["still", "still", "driftUp"],
    grammarAr: "أسلوب بسيط وأنيق: مساحات بيضاء واسعة، عنصر واحد لكل مشهد، لا زخرفة زائدة",
  },
  tech: {
    transitions: ["slideLeft", "zoomIn", "slideLeft"],
    motion: ["fadeInRight", "typewriter", "pulse"],
    lighting: "إضاءة تقنية باردة بتوهج أفقي على خلفية شبكية داكنة",
    cameraBias: ["panLeft", "zoomIn", "still"],
    grammarAr: "أسلوب تقني: خطوات مرقمة، مؤشرات دقيقة، حركة قاطعة لا مترددة",
  },
  documentary: {
    transitions: ["fade", "none", "fade"],
    motion: ["fadeIn", "fadeInUp"],
    lighting: "إضاءة طبيعية دافئة بظلال ناعمة تحاكي مكاناً حقيقياً",
    cameraBias: ["still", "driftUp", "zoomOut"],
    grammarAr: "أسلوب وثائقي: سرد هادئ متدفق، مشاهد تتنفس، لا اقتطاع حاد",
  },
};

