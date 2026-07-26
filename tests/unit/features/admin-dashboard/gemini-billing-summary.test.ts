import { summarizeGeminiBillingRows } from "@/features/admin-dashboard/lib/gemini-billing-client";
import { USD_JPY_RATE } from "@/features/admin-dashboard/lib/ai-cost-rates";

jest.mock("server-only", () => ({}));

const BASE = {
  provider: "google" as const,
  providerLabel: "Google",
  totalJpy: null,
  totalOriginal: null,
  originalCurrency: null,
};

describe("summarizeGeminiBillingRows", () => {
  it("行がなければ0円のreadyを返す(課金なしと請求データなしを区別しない)", () => {
    const result = summarizeGeminiBillingRows([], BASE);

    expect(result.status).toBe("ready");
    expect(result.totalJpy).toBe(0);
    expect(result.totalOriginal).toBe(0);
  });

  it("JPY請求はそのまま円として扱う", () => {
    const result = summarizeGeminiBillingRows(
      [{ currency: "JPY", totalCost: 1234.5 }],
      BASE
    );

    expect(result.totalJpy).toBeCloseTo(1234.5, 1);
    expect(result.originalCurrency).toBe("JPY");
  });

  it("USD請求は固定レートで円換算する", () => {
    const result = summarizeGeminiBillingRows(
      [{ currency: "USD", totalCost: 2 }],
      BASE
    );

    expect(result.totalJpy).toBeCloseTo(2 * USD_JPY_RATE, 1);
    expect(result.totalOriginal).toBeCloseTo(2, 4);
  });

  it("複数通貨の行を円ベースで合算する", () => {
    const result = summarizeGeminiBillingRows(
      [
        { currency: "JPY", totalCost: 100 },
        { currency: "USD", totalCost: 1 },
      ],
      BASE
    );

    expect(result.totalJpy).toBeCloseTo(100 + USD_JPY_RATE, 1);
  });

  it("BigQueryの数値ラッパーを解釈する", () => {
    const result = summarizeGeminiBillingRows(
      [{ currency: "JPY", totalCost: { value: "500" } }],
      BASE
    );

    expect(result.totalJpy).toBeCloseTo(500, 1);
  });

  it("小文字の通貨コードも大文字として判定する", () => {
    const result = summarizeGeminiBillingRows(
      [{ currency: "jpy", totalCost: 300 }],
      BASE
    );

    expect(result.totalJpy).toBeCloseTo(300, 1);
  });
});
