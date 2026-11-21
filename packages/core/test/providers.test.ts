import { describe, expect, it, vi } from "vitest";
import {
  GatewayError,
  MemorySecretStore,
  ProviderGateway,
  estimateCostForProvider,
  maskKey,
  redact,
  type TransportFn,
} from "../src/index";

function fakeTransport(
  respond: (url: string) => { status: number; body?: string; headers?: Record<string, string> } | "network-error",
  latencyMs = 12,
): TransportFn {
  return async (url, init) => {
    const result = respond(url, init);
    await new Promise((r) => setTimeout(r, 1));
    if (result === "network-error") throw new Error("ECONNREFUSED");
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: result.headers ?? {},
      text: result.body ?? "",
    };
  };
}

void fakeTransport;

describe("maskKey / redact", () => {
  it("قناع المفتاح يخفي الوسط فقط", () => {
    const masked = maskKey("sk-abc1234567890123456");
    expect(masked.includes("abc1234567890")).toBe(false);
    expect(masked.endsWith("3456")).toBe(true);
    expect(maskKey("")).toBe("(فارغ)");
  });

  it("redact يخفي الحقول الحساسة ويحفظ البقية", () => {
    const safe = redact({ name: "اختبار", apiKey: "sk-secret", nested: { token: "xyz", note: "سلام" } });
    expect(JSON.stringify(safe)).not.toContain("sk-secret");
    expect(JSON.stringify(safe)).not.toContain("xyz");
    expect(JSON.stringify(safe)).toContain("اختبار");
  });
});

describe("الاختيار والمفاتيح", () => {
  it("رفض النداء بلا مزوّد محدد", () => {
    const gw = new ProviderGateway();
    expect(() => gw.buildTestRequest("text")).toThrow(GatewayError);
  });

  it("رفض النداء مع مفتاح ناقص", () => {
    const gw = new ProviderGateway();
    gw.setSelection("text", { providerId: "openai" });
    expect(() => gw.buildTestRequest("text")).toThrow(/مفتاح/);
  });

  it("المزوّد المحلي لا يحتاج مفتاحاً", () => {
    const gw = new ProviderGateway();
    gw.setSelection("tts", { providerId: "piper-local" });
    expect(() => gw.buildTestRequest("tts")).not.toThrow();
  });

  it("المخزن الافتراضي هو الذاكرة — لا LocalStorage", () => {
    const gw = new ProviderGateway();
    gw.setSecret("text", "sk-test");
    expect(gw.getSecretMode()).toBe("memory");
    const store = new MemorySecretStore();
    expect(store.mode).toBe("memory");
  });
});

describe("testConnection", () => {
  it("نجاح: 200 يعيد ok مع زمن الاستجابة", async () => {
    const gw = new ProviderGateway({
      transport: fakeTransport(() => ({ status: 200, body: '{"data":[]}' })),
    });
    gw.setSelection("text", { providerId: "openai" });
    gw.setSecret("text", "sk-good");
    const res = await gw.testConnection("text");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.message).toContain("سليم");
  });

  it("مفتاح غير صالح: 401 يُبلغ بوضوح", async () => {
    const gw = new ProviderGateway({ transport: fakeTransport(() => ({ status: 401 })) });
    gw.setSelection("text", { providerId: "openai" });
    gw.setSecret("text", "sk-bad");
    const res = await gw.testConnection("text");
    expect(res.ok).toBe(false);
    expect(res.message).toContain("غير صالح");
  });

  it("rate limit: يحاول مرة واحدة إضافية ثم يبلغ بـ retryAfter", async () => {
    let calls = 0;
    const sleep = vi.fn(async () => {});
    const gw = new ProviderGateway({
      transport: fakeTransport(() => {
        calls += 1;
        return { status: 429, headers: { "retry-after": "1" } };
      }),
      sleep,
    });
    gw.setSelection("text", { providerId: "openai" });
    gw.setSecret("text", "sk-rl");
    const res = await gw.testConnection("text");
    expect(calls).toBe(2);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("429");
    expect(sleep).toHaveBeenCalled();
  });
});

describe("estimateCost", () => {
  it("مزوّد محلي: تكلفة صفر وسلاسل وحدات فارغة", () => {
    const gw = new ProviderGateway();
    gw.setSelection("tts", { providerId: "piper-local" });
    const est = gw.estimateCost("tts", { audioMinutes: 10 });
    expect(est.estimatedUsd).toBe(0);
    expect(est.approximate).toBe(true);
  });

  it("gpt-4o-mini: تقدير معقول من جدول الأسعار", () => {
    const gw = new ProviderGateway();
    gw.setSelection("text", { providerId: "openai", model: "gpt-4o-mini" });
    gw.setSecret("text", "sk-x");
    const est = gw.estimateCost("text", { inputTokens: 1_000_000, outputTokens: 200_000 });
    expect(est.estimatedUsd).toBeCloseTo(0.15 + 0.12, 3);
    expect(est.units.length).toBe(2);
  });
});

describe("runPaidTask — بوابة الإذن والميزانية", () => {
  it("رفض صريح في أي نداء مدفوع دون confirmPaid", async () => {
    const gw = new ProviderGateway();
    gw.setSelection("text", { providerId: "openai", model: "gpt-4o" });
    gw.setSecret("text", "sk-x");
    let ran = false;
    await expect(
      gw.runPaidTask("text", { confirmPaid: false, outputTokens: 100_000, run: () => { ran = true; return Promise.resolve(); } }),
    ).rejects.toThrow(/موافقة/);
    expect(ran).toBe(false);
    expect(gw.getUsage()[0].status).toBe("skipped-budget");
  });

  it("تجاوز سقف الميزانية يمنع التنفيذ", async () => {
    const gw = new ProviderGateway({ budgetUsd: 0.01 });
    gw.setSelection("video", { providerId: "runway", model: "gen-3a" });
    gw.setSecret("video", "rw-key");
    await expect(
      gw.runPaidTask("video", { confirmPaid: true, videoMinutes: 5, run: () => Promise.resolve() }),
    ).rejects.toThrow(/ميزانية/);
  });

  it("مع الإذن ضمن الميزانية: ينفذه ويسجل الاستهلاك", async () => {
    const gw = new ProviderGateway({ budgetUsd: 10 });
    gw.setSelection("text", { providerId: "openai", model: "gpt-4o-mini" });
    gw.setSecret("text", "sk-x");
    let ran = false;
    const res = await gw.runPaidTask("text", {
      confirmPaid: true,
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      run: () => { ran = true; return Promise.resolve(); },
    });
    expect(ran).toBe(true);
    expect(res.spentUsd).toBeGreaterThan(0);
    expect(gw.getUsage().find((u) => u.status === "ok")).toBeDefined();
    expect(gw.totalSpend()).toBe(res.spentUsd);
  });

  it("فشل التنفيذ يُسجل كمفشل ويرفع الخطأ", async () => {
    const gw = new ProviderGateway();
    gw.setSelection("text", { providerId: "openai", model: "gpt-4o-mini" });
    gw.setSecret("text", "sk-x");
    await expect(
      gw.runPaidTask("text", { confirmPaid: true, outputTokens: 100, run: () => Promise.reject(new Error("boom")) }),
    ).rejects.toThrow("boom");
    expect(gw.getUsage()[0].status).toBe("failed");
  });
});

describe("snapshotSafe", () => {
  it("بلا مفاتيح نصية في أي مكان", () => {
    const gw = new ProviderGateway();
    gw.setSelection("text", { providerId: "openai" });
    gw.setSecret("text", "sk-very-secret-value-987");
    const snap = JSON.stringify(gw.snapshotSafe());
    expect(snap).not.toContain("sk-very-secret-value-987");
    expect(snap).toContain("••••");
  });
});

describe("estimateCostForProvider + hasSecret", () => {
  it("يقدّر التكلفة قبل إدخال أي مفتاح (لا NO_PROVIDER ولا NO_KEY)", () => {
    const estimate = estimateCostForProvider("openai", "gpt-4o-mini", "text", { inputTokens: 4000, outputTokens: 1500 });
    expect(estimate.approximate).toBe(true);
    expect(estimate.estimatedUsd).toBeGreaterThan(0);
    expect(((4000 / 1_000_000) * 0.15 + (1500 / 1_000_000) * 0.6)).toBeCloseTo(estimate.estimatedUsd, 4);
    expect(() => estimateCostForProvider("مزوّد_غير_موجود", undefined)).toThrow(GatewayError);
  });

  it("المزوّد المحلي تكلفته صفر والمفتاح لا يُكشف نصاً", () => {
    const gw = new ProviderGateway();
    gw.setSelection("text", { providerId: "ollama" });
    gw.setSecret("text", "مفتاح-جلسي");
    expect(gw.hasSecret("text")).toBe(true);
    expect(estLocal().estimatedUsd).toBe(0);
    expect(JSON.stringify(gw.snapshotSafe())).not.toContain("مفتاح-جلسي");
  });
  function estLocal() {
    return estimateCostForProvider("ollama", undefined, "text", { inputTokens: 9999, outputTokens: 9999 });
  }
});
