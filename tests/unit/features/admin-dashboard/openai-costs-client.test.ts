import { sumOpenAiCosts } from "@/features/admin-dashboard/lib/openai-costs-client";

jest.mock("server-only", () => ({}));

describe("sumOpenAiCosts", () => {
  it("空レスポンスは0で既定通貨を返す", () => {
    expect(sumOpenAiCosts({})).toEqual({ totalUsd: 0, currency: "usd" });
    expect(sumOpenAiCosts({ data: [] })).toEqual({
      totalUsd: 0,
      currency: "usd",
    });
  });

  it("全バケット・全resultsを合計する", () => {
    const result = sumOpenAiCosts({
      data: [
        {
          results: [
            { amount: { value: 1.5, currency: "usd" } },
            { amount: { value: 0.25, currency: "usd" } },
          ],
        },
        { results: [{ amount: { value: 2, currency: "usd" } }] },
      ],
    });

    expect(result.totalUsd).toBeCloseTo(3.75, 4);
    expect(result.currency).toBe("usd");
  });

  it("results が空・amount 欠落のバケットを飛ばす", () => {
    const result = sumOpenAiCosts({
      data: [
        { results: [] },
        {},
        { results: [{}, { amount: {} }] },
        { results: [{ amount: { value: 1, currency: "usd" } }] },
      ],
    });

    expect(result.totalUsd).toBeCloseTo(1, 4);
  });

  it("数値でない値やNaNは無視する", () => {
    const result = sumOpenAiCosts({
      data: [
        {
          results: [
            { amount: { value: Number.NaN, currency: "usd" } },
            { amount: { value: 2, currency: "usd" } },
          ],
        },
      ],
    });

    expect(result.totalUsd).toBeCloseTo(2, 4);
  });

  it("レスポンスの通貨を採用する", () => {
    const result = sumOpenAiCosts({
      data: [{ results: [{ amount: { value: 1, currency: "eur" } }] }],
    });

    expect(result.currency).toBe("eur");
  });
});
