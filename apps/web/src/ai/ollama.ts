// Optional local AI via Ollama. Fully optional — offline templates are the default.

const PROMPT = (subject: string, type: string, scenes: number) =>
  `أنت كاتب سكريبتات موشن جرافيك عربي محترف. اكتب سكريبت فيديو عن: "${subject}".
نوع الفيديو: ${type}. عدد المشاهد المطلوب: بالضبط ${scenes}.
اكتب سطراً واحداً لكل مشهد (جملة سردية قصيرة بالعربية الفصحى المبسطة، من 8 إلى 20 كلمة).
الرد يجب أن يكون الأسطر فقط، بدون ترقيم، بدون مقدمات.`;

export interface OllamaConfig {
  url: string;
  model: string;
}

export async function detectOllama(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/tags`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listOllamaModels(url: string): Promise<string[]> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

/** Generate an Arabic scene script with a local model. Throws on failure (caller falls back). */
export async function ollamaScript(
  cfg: OllamaConfig,
  subject: string,
  typeNameAr: string,
  sceneCount: number,
): Promise<string[]> {
  const res = await fetch(`${cfg.url.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      prompt: PROMPT(subject, typeNameAr, sceneCount),
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { response?: string };
  const text = data.response ?? "";
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/^[\d\-•*\.\)\s]+/, "").trim())
    .filter((l) => l.length > 4 && /[\u0600-\u06FF]/.test(l));
  if (lines.length < 3) throw new Error("bad model output");
  return lines.slice(0, sceneCount);
}
