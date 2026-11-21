// لوحة أصول المشهد: بحث في مصادر مجانية مرخصة (Openverse/Wikimedia) + استخدام مباشر.
// لا صور عشوائية: كل نتيجة تعرض الترخيص والمصدر، والفشل يظهر كرسالة صريحة.

import { useState } from "react";
import { licenseNameAr } from "@msaipro/core";
import { downloadAsDataUrl, searchLicensedAssets, type CandidateAsset } from "../assets/assetSearch";

export function SceneAssetPanel(props: {
  queries: string[];
  width?: number;
  onPick: (dataUrl: string, asset: CandidateAsset) => void;
  showToast: (msg: string) => void;
}) {
  const { queries, width = 320, onPick, showToast } = props;
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CandidateAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const found = await searchLicensedAssets({ queries });
      setResults(found);
      if (!found.length) setError("لا نتائج مطابقة لمحتوى هذا المشهد في المصادر الحرة — جرّب الرفع من مكتبتك");
    } catch (e) {
      setError(`تعذّر الوصول للمصادر الحرة: ${(e as Error).message}`);
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (asset: CandidateAsset) => {
    setPicking(asset.id);
    try {
      const dataUrl = await downloadAsDataUrl(asset);
      onPick(dataUrl, asset);
      showToast(`أُضيفت الصورة — الترخيص: ${licenseNameAr(asset.license)}`);
    } catch (e) {
      showToast(`تعذّر تنزيل الصورة (قيود المصدر أو الشبكة): ${(e as Error).message}`);
    } finally {
      setPicking(null);
    }
  };

  return (
    <div
      style={{
        marginTop: 10,
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 10,
        background: "var(--bg2)",
        width,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>🖼 مصادر مجانية مرخصة</b>
        <span style={{ flex: 1 }} />
        <button className="btn small" disabled={busy} onClick={() => void run()}>
          {busy ? "جارٍ البحث..." : results ? "↻ بحث مجدداً" : "🖼 ابحث الآن"}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: "6px 0 0" }}>
        الاستعلام: {queries.join("، ")} — النتائج حصراً CC0/PDM/CC BY/CC BY-SA مع ذكر الترخيص.
      </p>
      {error && <p style={{ color: "#e07b7b", fontSize: 12.5, margin: "8px 0 0" }}>{error}</p>}
      {results && results.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
          {results.slice(0, 6).map((asset) => (
            <button
              key={asset.id}
              disabled={picking === asset.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 0,
                overflow: "hidden",
                background: "var(--bg)",
                cursor: picking === asset.id ? "wait" : "pointer",
                textAlign: "start",
              }}
              title={`${asset.title}\n${licenseNameAr(asset.license)} — ${asset.source}`}
              onClick={() => void pick(asset)}
            >
              <img
                src={asset.thumbUrl}
                alt={asset.title}
                style={{ width: "100%", height: 74, objectFit: "cover", display: "block" }}
                loading="lazy"
              />
              <span style={{ display: "block", fontSize: 10.5, padding: "4px 6px", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {licenseNameAr(asset.license)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
