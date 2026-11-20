// نظام الأصول البصرية الخالص: استخراج كلمات مفتاحية لكل مشهد، ترتيب المرشحين
// حسب ملاءمة المحتوى والترخيص (بلا عشوائية)، وخرائط التراخيص بالعربية.
// الشبكة نفسها في طبقة web — هنا لا fetch ولا DOM.

export const OPENVERSE_IMAGES_URL = "https://api.openverse.org/v1/images/";
export const WIKIMEDIA_SEARCH_URL = "https://commons.wikimedia.org/w/api.php";

export type AssetKind = "photo" | "illustration" | "icon" | "chart" | "video" | "typography";

/** تراخيص حرة تلتزم بها طبقة البحث — ممنوع إدخال صورة خارج هذه القائمة. */
export const ALLOWED_LICENSES = ["cc0", "pdm", "by", "by-sa"] as const;
export type AllowedLicense = (typeof ALLOWED_LICENSES)[number];

export function isAllowedLicense(license: string): license is AllowedLicense {
  return (ALLOWED_LICENSES as readonly string[]).includes(license.trim().toLowerCase());
}

export function licenseNameAr(license: string): string {
  const clean = license.trim().toLowerCase();
  if (clean === "cc0") return "(CC0) ملكية عامة — دون قيود";
  if (clean === "pdm") return "(مجال عام) علامة الملكية العامة";
  if (clean === "by") return "(CC BY) نسب المصنَّف";
  if (clean === "by-sa") return "(CC BY-SA) نسب المصنَّف ـ الترخيص بالمثل";
  return license;
}

const AR_STOPWORDS = new Set([
  "من", "في", "على", "إلى", "عن", "مع", "هذا", "هذه", "ذلك", "التي", "الذي", "أن", "إن",
  "أو", "ثم", "لكن", "حتى", "كلما", "عندما", "لكل", "لأن", "بينما", "جراء", "الخاصة", "والتي",
  "وقد", "كان", "كانت", "يكون", "اجعل", "استخدم", "فيديو", "مشهد", "شكل", "تفية", "أمام",
  "متوسط", "لقطة", "عرض", "قصير", "واضح",
]);

function tokenizeArabic(text: string): string[] {
  return text
    .replace(/[^\u0621-\u064A\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 22 && !AR_STOPWORDS.has(w))
    .map((w) => (w.startsWith("ال") && w.length > 4 ? w.slice(2) : w))
    .filter((w) => w.length >= 3);
}

/** كلمات مفتاحية لبحث الأصل البصري: الأوزان للفكرة البصرية ثم اللقطة ثم النص الظاهر. */
export function extractAssetKeywords(parts: {
  visualIdea?: string;
  shot?: string;
  onScreen?: string;
  voiceover?: string;
}, max = 5): string[] {
  const order = [parts.visualIdea ?? "", parts.shot ?? "", parts.onScreen ?? "", parts.voiceover ?? ""];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const source of order) {
    for (const word of tokenizeArabic(source)) {
      if (!seen.has(word)) {
        seen.add(word);
        out.push(word);
      }
      if (out.length >= max) break;
    }
    if (out.length >= max) break;
  }
  return out;
}

/** اجعل الاستعلام جاهزاً للمصادر اللاتينية: العربية تبقى لأمثال ويكيميديا التي تدعمها. */
export interface SceneAssetInput {
  onScreen?: string;
  voiceover?: string;
  visualIdea?: string;
  shot?: string;
  visualType?: string;
}

export function assetQueryForScene(scene: SceneAssetInput): { kind: AssetKind; query: string; queries: string[] } {
  const keywords = extractAssetKeywords({
    visualIdea: scene.visualIdea,
    shot: scene.shot,
    onScreen: scene.onScreen,
    voiceover: scene.voiceover,
  });
  const hint = `${scene.visualType ?? ""} ${scene.visualIdea ?? ""}`;
  const kind: AssetKind = /chart|بيان|شارت|مؤشر|نسبة/.test(hint)
    ? "chart"
    : /scene2D|شخص|وجه|طبيعة|مدينة|لقطة/.test(hint)
      ? "photo"
      : /خريطة|صورة|كاميرا/.test(hint)
        ? "photo"
        : /titleCard|kineticText|typography/.test(scene.visualType ?? "")
          ? "typography"
          : "illustration";
  const query = keywords.slice(0, 3).join(" ") || keywords[0] || "تصميم";
  const queries = keywords.length > 3 ? [query, keywords[3]] : [query];
  return { kind, query, queries: queries.filter((q) => q && q.length > 1) };
}

// ————————————————————————————————————————————————————————————
// ترتيب المرشحين: تطابق مفردات العنوان/الوسوم مع الاستعلام + أولوية الترخيص الحر
// ————————————————————————————————————————————————————————————

const LICENSE_SCORE: Record<string, number> = { cc0: 3, pdm: 3, by: 2, "by-sa": 1 };

export interface AssetCandidateInput {
  title: string;
  tags?: string[];
  license: string;
  width?: number;
  height?: number;
}

/** درجة ملاءمة = تطابق الكلمات + مكافأة الترخيص الحر. لا العشوائية ولا الجمال وحدها تقرر. */
function contentOverlap(candidate: AssetCandidateInput, queries: string[]): number {
  const haystack = `${candidate.title} ${candidate.tags?.join(" ") ?? ""}`.replace(/_/g, " ");
  const words = tokenizeArabic(haystack);
  const wordsLatin = haystack.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let overlap = 0;
  for (const q of queries) {
    for (const token of tokenizeArabic(q)) {
      if (words.includes(token)) overlap += 1;
    }
    if (wordsLatin.includes(q.toLowerCase())) overlap += 1;
  }
  return overlap;
}

export function scoreAsset(candidate: AssetCandidateInput, queries: string[]): number {
  const overlap = contentOverlap(candidate, queries);
  const licenseBonus = LICENSE_SCORE[candidate.license.trim().toLowerCase()] ?? 0;
  const pixels = (candidate.width ?? 0) * (candidate.height ?? 0);
  const resolutionBonus = pixels >= 1280 * 720 ? 1 : pixels >= 640 * 480 ? 0.5 : 0;
  return overlap * 2 + licenseBonus + resolutionBonus;
}

export function rankAssets<T extends AssetCandidateInput>(candidates: T[], queries: string[], limit = 12): T[] {
  return [...candidates]
    .filter((c) => contentOverlap(c, queries) > 0)
    .sort((a, b) => scoreAsset(b, queries) - scoreAsset(a, queries))
    .slice(0, limit);
}
