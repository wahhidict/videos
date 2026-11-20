// AI Provider Gateway — بوابة مزوّدان قابلة للتوسعة.
// خالصة وبلا تبعيات: النقل (fetch) والساعة وقلب المستهلك قابلة للحقن للاختبار.
// قواعد صارمة: لا نداء مدفوع دون تأكيد صريح، ولا مفاتيح في الكود أو السجل، ولا إعادة صياغة للأخطاء.

export type ProviderCapability = "text" | "image" | "video" | "tts" | "stt" | "music";

export interface ProviderDefinition {
  id: string;
  nameAr: string;
  capabilities: ProviderCapability[];
  endpoint: string;
  authHeader: string;
  authPrefix: string;
  docsUrl: string;
  pricingUrl?: string;
  requiresKey: boolean;
  local: boolean;
  defaultModel?: string;
}

/** مزوّدون معروفون — كل الخدمات المدفوعة اختيارية بالكامل والأدوات المحلية بدائل مضمونة. */
export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  { id: "openai", nameAr: "OpenAI", capabilities: ["text", "image", "tts", "stt"], endpoint: "https://api.openai.com/v1/models", authHeader: "Authorization", authPrefix: "Bearer ", docsUrl: "https://platform.openai.com/docs", pricingUrl: "https://openai.com/api/pricing", requiresKey: true, local: false, defaultModel: "gpt-4o-mini" },
  { id: "anthropic", nameAr: "Anthropic", capabilities: ["text"], endpoint: "https://api.anthropic.com/v1/models", authHeader: "x-api-key", authPrefix: "", docsUrl: "https://docs.anthropic.com", pricingUrl: "https://www.anthropic.com/pricing", requiresKey: true, local: false },
  { id: "google", nameAr: "Google AI", capabilities: ["text", "image", "video"], endpoint: "https://generativelanguage.googleapis.com/v1beta/models", authHeader: "x-goog-api-key", authPrefix: "", docsUrl: "https://ai.google.dev/docs", requiresKey: true, local: false },
  { id: "stability", nameAr: "Stability AI", capabilities: ["image", "music"], endpoint: "https://api.stability.ai/v1/user/account", authHeader: "Authorization", authPrefix: "Bearer ", docsUrl: "https://platform.stability.ai/docs", pricingUrl: "https://platform.stability.ai/pricing", requiresKey: true, local: false },
  { id: "runway", nameAr: "Runway", capabilities: ["video"], endpoint: "https://api.dev.runwayml.com/v1/image_to_video", authHeader: "Authorization", authPrefix: "Bearer ", docsUrl: "https://docs.dev.runwayml.com", pricingUrl: "https://runwayml.com/pricing", requiresKey: true, local: false },
  { id: "elevenlabs", nameAr: "ElevenLabs", capabilities: ["tts", "stt"], endpoint: "https://api.elevenlabs.io/v1/user", authHeader: "xi-api-key", authPrefix: "", docsUrl: "https://elevenlabs.io/docs", pricingUrl: "https://elevenlabs.io/pricing", requiresKey: true, local: false },
  { id: "ollama", nameAr: "Ollama (محلي)", capabilities: ["text"], endpoint: "http://127.0.0.1:11434/api/tags", authHeader: "", authPrefix: "", docsUrl: "https://github.com/ollama/ollama", requiresKey: false, local: true },
  { id: "piper-local", nameAr: "Piper TTS (محلي)", capabilities: ["tts"], endpoint: "local://piper", authHeader: "", authPrefix: "", docsUrl: "https://github.com/rhasspy/piper", requiresKey: false, local: true },
  { id: "whisper-local", nameAr: "Whisper (محلي)", capabilities: ["stt"], endpoint: "local://whisper", authHeader: "", authPrefix: "", docsUrl: "https://github.com/openai/whisper", requiresKey: false, local: true },
  { id: "ffmpeg-local", nameAr: "FFmpeg (محلي)", capabilities: ["music", "video"], endpoint: "local://ffmpeg", authHeader: "", authPrefix: "", docsUrl: "https://ffmpeg.org/documentation.html", requiresKey: false, local: true },
];

export interface CapabilitySelection {
  providerId: string;
  model?: string;
  baseUrl?: string;
}

export type CapabilityMap = Partial<Record<ProviderCapability, CapabilitySelection>>;

export interface SecretStoreLike {
  get(capability: ProviderCapability): string | null;
  set(capability: ProviderCapability, value: string | null): void;
  mode: "memory" | "os-keychain" | "insecure";
}

/** مخزن مفاتيح في الذاكرة فقط — الافتراضي للويب، لا شيء يُكتب إلى LocalStorage. */
export class MemorySecretStore implements SecretStoreLike {
  private keys = new Map<ProviderCapability, string>();
  mode: SecretStoreLike["mode"] = "memory";
  get(capability: ProviderCapability): string | null {
    return this.keys.get(capability) ?? null;
  }
  set(capability: ProviderCapability, value: string | null): void {
    if (value === null) this.keys.delete(capability);
    else this.keys.set(capability, value);
  }
}

export interface TransportFn {
  (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }): Promise<{
    ok: boolean;
    status: number;
    headers: Record<string, string>;
    text: string;
  }>;
}

export class GatewayError extends Error {
  code: "PAID_CONFIRMATION_REQUIRED" | "NO_PROVIDER" | "NO_KEY" | "BUDGET_EXCEEDED" | "PHYSICAL_TRANSPORT" | "INVALID_CONFIG";
  constructor(code: GatewayError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** تسعيرة تقريبية بالدولار لكل وحدة بسيطة — تُستخدم للتقدير فقط ولا يُعتبر فاتورة رسمية. */
const PRICE_TABLE: { pattern: RegExp; perMillionInput?: number; perMillionOutput?: number; perImage?: number; perMinuteAudio?: number; perMinuteVideo?: number }[] = [
  { pattern: /gpt-4o-mini/, perMillionInput: 0.15, perMillionOutput: 0.6 },
  { pattern: /gpt-4o/, perMillionInput: 2.5, perMillionOutput: 10 },
  { pattern: /claude-3-5-sonnet|claude-sonnet-4/, perMillionInput: 3, perMillionOutput: 15 },
  { pattern: /gemini/, perMillionInput: 0.1, perMillionOutput: 0.4 },
  { pattern: /dall-e/, perImage: 0.04 },
  { pattern: /stable-image|sd3/, perImage: 0.03 },
  { pattern: /veo|runway|gen-3/, perMinuteVideo: 0.5 },
  { pattern: /tts-1-hd/, perMinuteAudio: 0.03 },
  { pattern: /tts-1/, perMinuteAudio: 0.015 },
  { pattern: /whisper/, perMinuteAudio: 0.006 },
  { pattern: /elevenlabs/, perMinuteAudio: 0.18 },
];

export interface CostEstimate {
  capability: ProviderCapability;
  providerId: string;
  model: string;
  units: { kind: "inputTokens" | "outputTokens" | "images" | "audioMinutes" | "videoMinutes"; amount: number }[];
  estimatedUsd: number;
  approximate: true;
}

export interface UsageEntry {
  at: string;
  capability: ProviderCapability;
  providerId: string;
  model: string;
  estimatedUsd: number;
  status: "ok" | "failed" | "skipped-budget";
}

export interface GatewayOptions {
  transport?: TransportFn;
  secretStore?: SecretStoreLike;
  budgetUsd?: number;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ConnectionResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  message: string;
  retryAfterMs?: number;
}

/** قناع المفتاح: يعرض البادئة وآخر 4 أحرف فقط. */
export function maskKey(key: string): string {
  if (!key) return "(فارغ)";
  const clean = key.trim();
  if (clean.length <= 8) return `${"•".repeat(clean.length)}`;
  const prefixMatch = clean.match(/^(sk-|pk-|Bearer\s+)?/);
  const prefix = prefixMatch?.[0] ?? "";
  return `${prefix}${"•".repeat(Math.max(4, clean.length - prefix.length - 4))}${clean.slice(-4)}`;
}

export function redact(obj: unknown): unknown {
  if (typeof obj === "string") return /sk-|api[_-]?key|secret/i.test(obj) ? "«مُخفى»" : obj;
  if (Array.isArray(obj)) return obj.map(redact);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = /key|secret|token|password/i.test(k) ? "«مُخفى»" : redact(v);
    }
    return out;
  }
  return obj;
}

export interface RunPaidTaskOptions {
  /** إذن صريح من المستخدم بعد عرض التكلفة المقدّرة — مطلوب لأي نداء مدفوع. */
  confirmPaid: boolean;
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  audioMinutes?: number;
  videoMinutes?: number;
  run: () => Promise<void>;
}

export interface CostUnits {
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  audioMinutes?: number;
  videoMinutes?: number;
}

/** تقدير تكلفة مستقل عن المفتاح — يُستخدم لعرض التكلفة المقدّرة قبل إدخال المفتاح أو أي نداء. */
export function estimateCostForProvider(
  providerId: string,
  modelHint: string | undefined,
  capability: ProviderCapability = "text",
  units: CostUnits = {},
): CostEstimate {
  const provider = PROVIDER_REGISTRY.find((p) => p.id === providerId);
  if (!provider) throw new GatewayError("INVALID_CONFIG", `مزوّد غير معروف: ${providerId}`);
  const model = modelHint ?? provider.defaultModel ?? provider.id;
  if (provider.local) {
    return { capability, providerId: provider.id, model, units: [], estimatedUsd: 0, approximate: true };
  }
  const row = PRICE_TABLE.find((r) => r.pattern.test(model));
  const unitList: CostEstimate["units"] = [];
  let total = 0;
  if (row) {
    if (units.inputTokens) unitList.push({ kind: "inputTokens", amount: units.inputTokens });
    if (units.outputTokens) unitList.push({ kind: "outputTokens", amount: units.outputTokens });
    if (units.images) unitList.push({ kind: "images", amount: units.images });
    if (units.audioMinutes) unitList.push({ kind: "audioMinutes", amount: units.audioMinutes });
    if (units.videoMinutes) unitList.push({ kind: "videoMinutes", amount: units.videoMinutes });
    total =
      ((units.inputTokens ?? 0) / 1_000_000) * (row.perMillionInput ?? 0) +
      ((units.outputTokens ?? 0) / 1_000_000) * (row.perMillionOutput ?? 0) +
      (units.images ?? 0) * (row.perImage ?? 0) +
      (units.audioMinutes ?? 0) * (row.perMinuteAudio ?? 0) +
      (units.videoMinutes ?? 0) * (row.perMinuteVideo ?? 0);
  }
  return { capability, providerId: provider.id, model, units: unitList, estimatedUsd: Math.round(total * 10_000) / 10_000, approximate: true };
}

export class ProviderGateway {
  private readonly transport: TransportFn | null;
  private readonly secrets: SecretStoreLike;
  private readonly clock: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private selections: CapabilityMap = {};
  private budgetUsd: number;
  private usage: UsageEntry[] = [];

  constructor(options: GatewayOptions = {}) {
    this.transport = options.transport ?? null;
    this.secrets = options.secretStore ?? new MemorySecretStore();
    this.budgetUsd = options.budgetUsd ?? 5;
    this.clock = options.clock ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  }

  getSecretMode(): SecretStoreLike["mode"] {
    return this.secrets.mode;
  }

  setSelection(capability: ProviderCapability, selection: CapabilitySelection | null): void {
    if (selection === null) delete this.selections[capability];
    else this.selections[capability] = { ...selection };
  }

  getSelection(capability: ProviderCapability): CapabilitySelection | null {
    return this.selections[capability] ?? null;
  }

  setSecret(capability: ProviderCapability, value: string | null): void {
    this.secrets.set(capability, value);
  }

  /** للواجهة فقط: هل المفتاح موجود؟ القيمة نفسها لا تُطبع أبداً إلا عبر maskKey. */
  hasSecret(capability: ProviderCapability): boolean {
    return Boolean(this.secrets.get(capability));
  }

  /** للواجهة فقط: تمرير قيمة المفتاح إلى ترويسة مزوّد — ممنوع تسجيلها أو حفظها في أي ملف. */
  getSecret(capability: ProviderCapability): string | null {
    return this.secrets.get(capability);
  }

  setBudget(usd: number): void {
    this.budgetUsd = Math.max(0, usd);
  }

  getBudget(): number {
    return this.budgetUsd;
  }

  listProviders(capability?: ProviderCapability): ProviderDefinition[] {
    return capability ? PROVIDER_REGISTRY.filter((p) => p.capabilities.includes(capability)) : [...PROVIDER_REGISTRY];
  }

  private resolve(capability: ProviderCapability): { provider: ProviderDefinition; selection: CapabilitySelection } {
    const selection = this.selections[capability];
    if (!selection) throw new GatewayError("NO_PROVIDER", `لم يُحدَّد مزوّد للوظيفة «${capability}»`);
    const provider = PROVIDER_REGISTRY.find((p) => p.id === selection.providerId);
    if (!provider) throw new GatewayError("INVALID_CONFIG", `مزوّد غير معروف: ${selection.providerId}`);
    if (!provider.capabilities.includes(capability)) {
      throw new GatewayError("INVALID_CONFIG", `المزوّد ${provider.nameAr} لا يدعم الوظيفة ${capability}`);
    }
    if (provider.requiresKey && !this.secrets.get(capability)) {
      throw new GatewayError("NO_KEY", `يلزم مفتاح واجهة لخدمة ${provider.nameAr} قبل الاستخدام`);
    }
    return { provider, selection };
  }

  buildTestRequest(capability: ProviderCapability): { url: string; method: string; headers: Record<string, string> } {
    const { provider, selection } = this.resolve(capability);
    const url = selection.baseUrl ? selection.baseUrl.replace(/\/$/, "") + "/models" : provider.endpoint;
    const headers: Record<string, string> = {};
    const key = this.secrets.get(capability);
    if (provider.authHeader && key) headers[provider.authHeader] = `${provider.authPrefix}${key}`;
    headers.Accept = "application/json";
    return { url, method: "GET", headers };
  }

  /** اختبار اتصال آمن (GET فقط) مع معالجة 429/5xx/شبكة وحد أقصى محاولتين. */
  async testConnection(capability: ProviderCapability): Promise<ConnectionResult> {
    const { provider } = this.resolve(capability);
    if (provider.endpoint.startsWith("local://")) {
      return { ok: false, status: null, latencyMs: 0, message: `أداة محلية (${provider.nameAr}) — اختبار الاتصال يتم عبر مدير الأدوات عند الاستخدام الفعلي` };
    }
    if (!this.transport) throw new GatewayError("PHYSICAL_TRANSPORT", "لا يوجد مسار شبكة متاح في هذه البيئة");
    const request = this.buildTestRequest(capability);
    const attempts = 2;
    let last: ConnectionResult | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const start = this.clock();
      try {
        const res = await this.transport(request.url, { method: request.method, headers: request.headers });
        const latencyMs = this.clock() - start;
        const retryAfterMs = res.headers["retry-after"] ? Number(res.headers["retry-after"]) * 1000 : undefined;
        if (res.ok) {
          return { ok: true, status: res.status, latencyMs, message: `الاتصال بخدمة ${provider.nameAr} سليم (${latencyMs}ms)` };
        }
        last = {
          ok: false,
          status: res.status,
          latencyMs,
          retryAfterMs,
          message:
            res.status === 401 || res.status === 403
              ? `المفتاح غير صالح أو غير مصرّح له (HTTP ${res.status})`
              : res.status === 429
                ? "تجاوز حد الطلبات (429) — سيُعاد المحاولة مرة واحدة"
                : `خطأ من الخدمة (HTTP ${res.status})`,
        };
      } catch (error) {
        last = { ok: false, status: null, latencyMs: this.clock() - start, message: `تعذر الوصول إلى الشبكة: ${(error as Error).message}` };
      }
      if (attempt < attempts - 1 && (last.status === 429 || last.status === null || last.status >= 500)) {
        await this.sleep(Math.max(100, Math.min(last.retryAfterMs ?? 500, 4000)));
      } else {
        break;
      }
    }
    return last ?? { ok: false, status: null, latencyMs: 0, message: "فشل الاتصال دون تفاصيل" };
  }

  /** تقدير تكلفة محلي خالص — لا شبكة ولا رصيد. */
  estimateCost(
    capability: ProviderCapability,
    units: { inputTokens?: number; outputTokens?: number; images?: number; audioMinutes?: number; videoMinutes?: number },
  ): CostEstimate {
    const { provider, selection } = this.resolve(capability);
    return estimateCostForProvider(provider.id, selection.model, capability, units);
  }

  /** تنفيذ مهمة مدفوعة فقط بعد إذن صريح + فحص الميزانية + تسجيل الاستهلاك. */
  async runPaidTask(capability: ProviderCapability, options: RunPaidTaskOptions): Promise<{ spentUsd: number }> {
    const definition = this.estimateCost(capability, {
      inputTokens: options.inputTokens,
      outputTokens: options.outputTokens,
      images: options.images,
      audioMinutes: options.audioMinutes,
      videoMinutes: options.videoMinutes,
    });
    if (!options.confirmPaid) {
      this.record(capability, definition, "skipped-budget");
      throw new GatewayError("PAID_CONFIRMATION_REQUIRED", `هذه العملية قد تكلف ${definition.estimatedUsd}$ تقريباً — تلزم موافقة المستخدم الصريحة قبل أي طلب مدفوع`);
    }
    const spent = this.totalSpend();
    if (spent + definition.estimatedUsd > this.budgetUsd) {
      this.record(capability, definition, "skipped-budget");
      throw new GatewayError("BUDGET_EXCEEDED", `كلفة العملية المقدّرة (${definition.estimatedUsd}$) تتجاوز سقف الميزانية المتبقي (${(this.budgetUsd - spent).toFixed(4)}$)`);
    }
    try {
      await options.run();
      this.record(capability, definition, "ok");
    } catch (error) {
      this.record(capability, definition, "failed");
      throw error;
    }
    return { spentUsd: definition.estimatedUsd };
  }

  private record(capability: ProviderCapability, estimate: CostEstimate, status: UsageEntry["status"]): void {
    this.usage.push({
      at: new Date(this.clock()).toISOString(),
      capability,
      providerId: estimate.providerId,
      model: estimate.model,
      estimatedUsd: status === "ok" ? estimate.estimatedUsd : 0,
      status,
    });
  }

  totalSpend(): number {
    return this.usage.filter((u) => u.status === "ok").reduce((a, u) => a + u.estimatedUsd, 0);
  }

  getUsage(): UsageEntry[] {
    return [...this.usage];
  }

  /** snapshot آمن بدون أي مفاتيح — المستخدم منصوص عليه prefix فقط. */
  snapshotSafe(): object {
    return {
      selections: redact(this.selections),
      secrets: this.listProviders().reduce<Record<string, string>>((acc, p) => {
        for (const c of p.capabilities) {
          const key = this.secrets.get(c);
          if (key) acc[c] = maskKey(key);
        }
        return acc;
      }, {}),
      budgetUsd: this.budgetUsd,
      spentUsd: this.totalSpend(),
      usageEntries: this.usage.length,
      transportAvailable: this.transport !== null,
    };
  }
}
