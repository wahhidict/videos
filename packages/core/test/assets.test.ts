import { describe, expect, it } from "vitest";
import {
  assetQueryForScene,
  extractAssetKeywords,
  isAllowedLicense,
  licenseNameAr,
  rankAssets,
  scoreAsset,
} from "../src/assets";

describe("extractAssetKeywords", () => {
  it("يستخرج كلمات محتوى عربية ويتجاهل كلمات الإخراج والتوقف", () => {
    const keywords = extractAssetKeywords({
      visualIdea: "أيقونة قطرة ماء تكبر داخل جسم الإنسان",
      shot: "لقطة متوسطة تعرض الأيقونة",
      onScreen: "الماء ضروري",
    });
    expect(keywords).not.toContain("لقطة");
    expect(keywords).not.toContain("متوسط");
    expect(keywords.some((k) => k.includes("ماء") || k.includes("قطرة") || k.includes("أيقونة"))).toBe(true);
    expect(keywords.length).toBeLessThanOrEqual(5);
  });

  it("أولوية الفكرة البصرية قبل اللقطة قبل النص الظاهر", () => {
    const keywords = extractAssetKeywords({
      visualIdea: "قلب ينبض",
      shot: "لقطة قلبه",
      onScreen: "قلب النص",
    });
    expect(keywords[0]).toBe("قلب");
    expect(keywords[0]).not.toBe("النص");
  });
});

describe("assetQueryForScene", () => {
  it("يحدد الأنواع: شارت → chart وشخص → photo وأيقونة → illustration", () => {
    const chart = assetQueryForScene({ visualIdea: "رسم بياني يقارن النسب", visualType: "evidence" });
    expect(chart.kind).toBe("chart");
    const photo = assetQueryForScene({ visualIdea: "شخص يشرب الماء", visualType: "scene2D" });
    expect(photo.kind).toBe("photo");
    const icon = assetQueryForScene({ visualIdea: "أيقونة قطرة ماء", visualType: "infographic" });
    expect(icon.kind).toBe("illustration");
  });

  it("الاستعلام مأخوذ من كلمات المحتوى الفعلي وليس عبارة فارغة", () => {
    const result = assetQueryForScene({
      onScreen: "أهمية شرب الماء",
      voiceover: "جسم الإنسان يحتاج الماء",
      visualIdea: "قطرة ماء كبيرة",
    });
    expect(result.query.length).toBeGreaterThan(2);
    expect(result.queries).toContain(result.query);
  });
});

describe("scoreAsset + rankAssets", () => {
  const queries = ["قطرة ماء"];

  it("الترتيب: تطابق المحتوى أولاً ثم الترخيص الحر ثم الدقة", () => {
    const matching = scoreAsset(
      { title: "water_drop", tags: ["قطرة", "ماء"], license: "by", width: 800, height: 600 },
      queries,
    );
    const unrelated = scoreAsset({ title: "mountain sunset", tags: [], license: "cc0", width: 4000, height: 2000 }, queries);
    expect(matching).toBeGreaterThan(unrelated);
    const cc0Same = scoreAsset({ title: "water_drop", tags: ["قطرة", "ماء"], license: "cc0", width: 800, height: 600 }, queries);
    expect(cc0Same).toBeGreaterThan(matching);
  });

  it("rankAssets يرفع غير المطابق من القائمة نهائياً", () => {
    const ranked = rankAssets(
      [
        { title: "vase", tags: [], license: "cc0" },
        { title: "قطرة ماء على ورقة", tags: ["ماء"], license: "by" },
        { title: "vase2", tags: ["زجاج"], license: "pdm" },
        { title: "بحر وقطرات ماء", tags: ["ماء", "بحر"], license: "by-sa" },
      ],
      queries,
    );
    expect(ranked.some((r) => r.title === "vase")).toBe(false);
    expect(ranked[0].title).toBe("قطرة ماء على ورقة");
  });

  it("rankAssets يحد عدد النتائج بالسقف المطلوب", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `قطرة ماء ${i}`, tags: ["ماء"], license: "by" }));
    expect(rankAssets(many, queries, 12)).toHaveLength(12);
  });
});

describe("التراخيص", () => {
  it("قائمة التراخيص المسموحة فقط", () => {
    expect(isAllowedLicense("CC0")).toBe(true);
    expect(isAllowedLicense("BY-SA")).toBe(true);
    expect(isAllowedLicense("")).toBe(false);
    expect(isAllowedLicense("gpl-3")).toBe(false);
    expect(licenseNameAr("cc0")).toContain("ملكية عامة");
    expect(licenseNameAr("by-sa")).toContain("نسب المصنَّف");
  });
});
