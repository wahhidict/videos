// بحث مصادر مجانية مرخصة (بلا مفاتيح): Openverse + Wikimedia Commons.
// إذن المستخدم مطلوب: البحث يشتغل عند الطلب من لوحة المشاهد فقط.
// نتيجة فاشلة = رسالة واضحة، لا صور عشوائية.

import { OPENVERSE_IMAGES_URL, WIKIMEDIA_SEARCH_URL, rankAssets, type AssetKind } from "@msaipro/core";

export interface CandidateAsset {
  id: string;
  title: string;
  url: string;
  thumbUrl: string;
  license: string;
  licenseUrl: string;
  width: number;
  height: number;
  source: "openverse" | "wikimedia";
  query: string;
}

function normalizeLicense(raw: string | undefined): string {
  if (!raw) return "by";
  const s = raw.toLowerCase();
  if (s.includes("cc0") || s.includes("public domain mark") || s === "pdm") return "pdm";
  if (s.includes("by-sa") || s.includes("ترخيص بالمثل") || s.includes("sharealike")) return "by-sa";
  if (s.includes("by") || s.includes("attribution") || s.includes("نسب")) return "by";
  return "by";
}

interface OpenverseRow {
  id?: string;
  title?: string;
  url?: string;
  thumbnail?: string;
  license?: string;
  license_url?: string;
  width?: number;
  height?: number;
}

async function searchOpenverse(query: string, signal?: AbortSignal): Promise<CandidateAsset[]> {
  const url = `${OPENVERSE_IMAGES_URL}?q=${encodeURIComponent(query)}&license=cc0,pdm,by,by-sa&page_size=8`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Openverse: HTTP ${res.status}`);
  const json = (await res.json()) as { results?: OpenverseRow[] };
  return (json.results ?? [])
    .filter((r) => r.url && r.id)
    .map((r) => ({
      id: `openverse:${r.id}`,
      title: r.title ?? query,
      url: r.url as string,
      thumbUrl: r.thumbnail ?? (r.url as string),
      license: sanitizeLicense(r.license),
      licenseUrl: r.license_url ?? "https://creativecommons.org/licenses/",
      width: r.width ?? 0,
      height: r.height ?? 0,
      source: "openverse" as const,
      query,
    }));
}

function sanitizeLicense(l: string | undefined): string {
  if (!l) return "by";
  if (isCc0(l)) return "cc0";
  if (isPdm(l)) return "pdm";
  if (isBySa(l)) return "by-sa";
  return "by";
}
function isCc0(s: string | undefined): boolean { return Boolean(s && s.toLowerCase().includes("cc0")); }
function isPdm(s: string | undefined): boolean { return Boolean(s && (s.toLowerCase().includes("pdm") || s.toLowerCase().includes("public domain mark"))); }
function isBySa(s: string | undefined): boolean { return Boolean(s && s.toLowerCase().includes("by-sa")); }

interface WikimediaPage {
  index?: number;
  title?: string;
  imageinfo?: {
    url?: string;
    thumburl?: string;
    descriptionshorturl?: string;
    width?: number;
    height?: number;
    extmetadata?: {
      LicenseShortName?: { value?: string };
      LicenseUrl?: { value?: string };
    };
  }[];
}

async function searchWikimedia(query: string, signal?: AbortSignal): Promise<CandidateAsset[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap|drawing ${query}`,
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "640",
    format: "json",
    origin: "*",
  });
  const res = await fetch(`${WIKIMEDIA_SEARCH_URL}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Wikimedia: HTTP ${res.status}`);
  const json = (await res.json()) as { query?: { pages?: Record<string, WikimediaPage> } };
  const pages = Object.values(json.query?.pages ?? {});
  return pages
    .filter((p) => p.imageinfo?.[0]?.url)
    .map((p) => ({
      id: `wikimedia:${p.title ?? p.index}`,
      title: p.title ?? query,
      url: p.imageinfo?.[0]?.url ?? "",
      thumbUrl: p.imageinfo?.[0]?.thumburl ?? p.imageinfo?.[0]?.url ?? "",
      license: normalizeLicense(p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value),
      licenseUrl: p.imageinfo?.[0]?.extmetadata?.LicenseUrl?.value ?? "https://commons.wikimedia.org/",
      width: p.imageinfo?.[0]?.width ?? 0,
      height: p.imageinfo?.[0]?.height ?? 0,
      source: "wikimedia" as const,
      query,
    }));
}

/** بحث موحد في المصادر الحرة: نجاح واحد يكفي؛ الواقع المُرَتَّب معروض بلا عشوائية. */
export async function searchLicensedAssets(options: {
  queries: string[];
  kind?: AssetKind;
  signal?: AbortSignal;
  limit?: number;
}): Promise<CandidateAsset[]> {
  const results = await Promise.allSettled(
    options.queries.flatMap((q) => [searchOpenverse(q, options.signal), searchWikimedia(q, options.signal)]),
  );
  const candidates: CandidateAsset[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const asset of r.value) {
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      candidates.push(asset);
    }
  }
  return rankAssets(candidates, options.queries, options.limit ?? 9);
}

/** تنزيل الصورة المختارة وتحويلها لبيانات داخلية (scaled data URL) لضمان إمكانية الرندر والتصدير. */
export async function downloadAsDataUrl(asset: CandidateAsset, maxSide = 1600): Promise<string> {
  const response = await fetch(asset.url.startsWith("http") ? asset.url : asset.thumbUrl, { mode: "cors" });
  if (!response.ok) throw new Error(`تعذّر تنزيل الصورة (HTTP ${response.status})`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذّر تجهيز الصورة");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.9);
}
