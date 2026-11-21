// طبقة النموذج اللغوي في الويب: بوابة جلسية (ذاكرة فقط) + نداء مزوّدين حقيقي.
// قواعد صارمة: المفتاح لا يُكتب في LocalStorage أو السجل أو snapshot؛
// لا نداء مدفوع إلا عبر runPaidTask بموافقة صريحة من الواجهة.

import {
  MemorySecretStore,
  ProviderGateway,
  type CostEstimate,
  estimateCostForProvider,
} from "@msaipro/core";

type Transport = NonNullable<ConstructorParameters<typeof ProviderGateway>[0]>["transport"];

const browserTransport: Transport = async (url, init) => {
  const res = await fetch(url, {
    method: init.method,
    headers: init.headers,
    signal: init.signal,
  });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  return { ok: res.ok, status: res.status, headers, text: await res.text() };
};

let gateway: ProviderGateway | null = null;

export function getAIGateway(): ProviderGateway {
  if (!gateway) {
    gateway = new ProviderGateway({
      transport: browserTransport,
      secretStore: new MemorySecretStore(),
      budgetUsd: 5,
    });
  }
  return gateway;
}

/** يُستدعى عند فتح الإعدادات أو قبل أي استخدام لتطبيق إعدادات النموذج (بدون لمس المفتاح إلا صراحة). */
export function configureLLMGateway(settings: {
  llmProvider: string;
  llmModel: string;
  llmBudgetUsd: number;
  llmBaseUrl?: string;
}): void {
  const gw = getAIGateway();
  gw.setBudget(Math.max(0, settings.llmBudgetUsd));
  if (settings.llmProvider) {
    gw.setSelection("text", {
      providerId: settings.llmProvider,
      model: settings.llmModel || undefined,
      baseUrl: settings.llmBaseUrl || undefined,
    });
  }
}

export function saveLLMKey(key: string | null): void {
  getAIGateway().setSecret("text", key && key.trim() ? key.trim() : null);
}

export function hasLLMKey(): boolean {
  return getAIGateway().hasSecret("text");
}

export function maskedLLMKeyHint(): string | null {
  const gw = getAIGateway();
  if (!gw.hasSecret("text")) return null;
  return gw.getSecretMode() === "memory" ? "مفتاح جلسي (يُمحى عند إغلاق التطبيق)" : gw.getSecretMode();
}

export function estimatePlanCost(options: {
  providerId: string;
  model: string;
  promptChars: number;
  sceneCount: number;
}): CostEstimate {
  return estimateCostForProvider(options.providerId, options.model, "text", {
    inputTokens: Math.ceil(options.promptChars / 3.5),
    outputTokens: options.sceneCount * 130,
  });
}

function splitPrompt(prompt: string): { system: string; user: string } {
  const marker = "===== USER =====";
  const idx = prompt.indexOf(marker);
  if (idx < 0) return { system: "", user: prompt };
  return { system: prompt.slice(0, idx).trim(), user: prompt.slice(idx + marker.length).trim() };
}

function requireKey(): string {
  const value = getAIGateway().getSecret("text");
  if (!value) throw new Error("المفتاح غير مثبّت — أدخله من الإعدادات أولاً");
  return value;
}

/** نداء النموذج الفعلي حسب المزوّد المختار — يرمي خطأ مفهوماً عند الفشل. */
export async function completeViaGateway(prompt: string): Promise<string> {
  const selection = getAIGateway().getSelection("text");
  if (!selection) throw new Error("لم يُختر مزوّد نصوص في الإعدادات");
  const { system, user } = splitPrompt(prompt);
  const model = selection.model;

  if (selection.providerId === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requireKey()}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI: HTTP ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new Error("رد OpenAI فارغ");
    return text;
  }

  if (selection.providerId === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "x-api-key": requireKey(),
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic: HTTP ${res.status}`);
    const json = (await res.json()) as { content?: { text?: string }[] };
    const text = json.content?.map((c) => c.text ?? "").join("");
    if (!text) throw new Error("رد Anthropic فارغ");
    return text;
  }

  if (selection.providerId === "google") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "gemini-2.0-flash")}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": requireKey(),
        },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [{ role: "user", parts: [{ text: user }] }],
        }),
      },
    );
    if (!res.ok) throw new Error(`Google AI: HTTP ${res.status}`);
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text) throw new Error("رد Google AI فارغ");
    return text;
  }

  if (selection.providerId === "ollama") {
    const base = (selection.baseUrl || "http://localhost:11434").replace(/\/$/, "");
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "llama3.1",
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama: HTTP ${res.status}`);
    const json = (await res.json()) as { message?: { content?: string } };
    const text = json.message?.content;
    if (!text) throw new Error("رد Ollama فارغ");
    return text;
  }

  throw new Error(`لا يوجد نداء مدفوع مهيّأ للمزوّد ${selection.providerId} بعد — اختر OpenAI أو Anthropic أو Google أو Ollama`);
}
