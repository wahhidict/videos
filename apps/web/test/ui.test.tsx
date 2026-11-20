// اختبار تدفق المستخدم الكامل في الواجهة العربية (jsdom):
// لوحة البداية → المعالج → لوحة المشاهد → المحرر → حوار التصدير → حفظ واستعادة المشروع.

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AppProvider } from "../src/store/appState";
import { App } from "../src/App";

function mountApp(): ReturnType<typeof render> {
  return render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

const next = () => fireEvent.click(screen.getByRole("button", { name: /التالي/ }));

describe("التدفّق الكامل: من الفكرة إلى المحرر", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("لوحة البداية تعرض الإجراءات الستة بالعربية", () => {
    mountApp();
    for (const label of [
      "إنشاء فيديو جديد",
      "تحويل نص إلى فيديو",
      "إنشاء فيديو تعليمي",
      "إنشاء فيديو إعلاني",
      "استخدام قالب جاهز",
      "مشاريعي السابقة",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("المعالج يبني مشاهد حقيقية ويصل إلى المحرر", async () => {
    mountApp();
    fireEvent.click(screen.getByText("إنشاء فيديو جديد"));
    await screen.findByText("اسم المشروع");

    fireEvent.change(screen.getByPlaceholderText(/اكتب فكرة/), {
      target: { value: "فوائد المشي اليومي — فيديو صحي مبسّط" },
    });
    next();
    fireEvent.click(await screen.findByText("تعليمي", { exact: true }));
    next();
    fireEvent.click(await screen.findByText("30 ثانية"));
    next();
    fireEvent.click(await screen.findByText("إنفوغرافيك"));
    next();
    fireEvent.click(await screen.findByText("بدون صوت"));
    next();
    fireEvent.click(screen.getByRole("button", { name: /إنشاء الفيديو/ }));

    await screen.findByText("لوحة المشاهد");
    await waitFor(() => expect(document.querySelectorAll(".sb-card").length).toBeGreaterThanOrEqual(3), { timeout: 8000 });

    fireEvent.click(screen.getByRole("button", { name: /افتح المحرر/ }));
    await screen.findByText("خط الزمن");
    expect(document.querySelector(".editor")).toBeTruthy();
    expect(document.querySelectorAll(".sidebar-tab").length).toBe(6);

    await screen.findByRole("button", { name: /تصدير الفيديو/ });
    fireEvent.click(screen.getByRole("button", { name: /تصدير الفيديو/ }));
    await screen.findByText(/بدون خدمات مدفوعة/);
    expect(document.querySelector(".modal select")).toBeTruthy();
    expect(screen.getByRole("button", { name: /تصدير SRT/ })).toBeTruthy();
  });

  it("الحفظ التلقائي يستعيد المشروع من مشاريعي السابقة", { timeout: 20000 }, async () => {
    mountApp();
    fireEvent.click(screen.getByText("إنشاء فيديو جديد"));
    await screen.findByText("اسم المشروع");
    fireEvent.change(screen.getByPlaceholderText(/اكتب فكرة/), {
      target: { value: "مشاريع الاستدامة في المدن العربية" },
    });
    next();
    fireEvent.click(await screen.findByText("وثائقي", { exact: true }));
    next();
    fireEvent.click(await screen.findByText("30 ثانية"));
    next();
    fireEvent.click(await screen.findByText("سينمائي"));
    next();
    fireEvent.click(await screen.findByText("بدون صوت"));
    next();
    fireEvent.click(screen.getByRole("button", { name: /إنشاء الفيديو/ }));
    await screen.findByText("لوحة المشاهد");
    await waitFor(() => expect(localStorage.getItem("msaipro.projects")).toBeTruthy(), { timeout: 5000 });

    cleanup();
    mountApp();
    fireEvent.click(screen.getByText("مشاريعي السابقة"));
    expect((await screen.findAllByText(/مشاهد/, {}, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(screen.getByText("فيديو جديد")).toBeTruthy();
  });
});
