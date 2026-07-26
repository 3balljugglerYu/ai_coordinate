import { buildAiCostEstimate } from "@/features/admin-dashboard/lib/build-ai-cost";
import { USD_JPY_RATE } from "@/features/admin-dashboard/lib/ai-cost-rates";

// 固定ウィンドウ(3日): current=[07-24T00:00Z, 07-26T12:00Z]
const NOW = new Date("2026-07-26T12:00:00.000Z");
const CURRENT_START = new Date("2026-07-24T00:00:00.000Z");

const GPT_LOW_USD = 0.006;
const GEMINI_FLASH_USD = 0.067;

describe("buildAiCostEstimate", () => {
  it("生成がなくても期間分の日別バケットを埋めて0円を返す", () => {
    const result = buildAiCostEstimate([], CURRENT_START, NOW);

    expect(result.totalUsd).toBe(0);
    expect(result.totalJpy).toBe(0);
    expect(result.byModel).toEqual([]);
    expect(result.unknownModelCount).toBe(0);
    expect(result.days.map((day) => day.bucket)).toEqual([
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
    ]);
    expect(result.days.every((day) => day.totalJpy === 0)).toBe(true);
  });

  it("モデル別単価で合計USDと円換算を算出する", () => {
    const result = buildAiCostEstimate(
      [
        { model: "gpt-image-2-low-1k", created_at: "2026-07-25T01:00:00.000Z" },
        { model: "gpt-image-2-low-1k", created_at: "2026-07-25T02:00:00.000Z" },
        {
          model: "gemini-3.1-flash-image-preview-1024",
          created_at: "2026-07-25T03:00:00.000Z",
        },
      ],
      CURRENT_START,
      NOW
    );

    const expectedUsd = GPT_LOW_USD * 2 + GEMINI_FLASH_USD;
    expect(result.totalUsd).toBeCloseTo(expectedUsd, 4);
    expect(result.totalJpy).toBeCloseTo(expectedUsd * USD_JPY_RATE, 1);
  });

  it("日別バケットをプロバイダ別に分けて積み上げる", () => {
    const result = buildAiCostEstimate(
      [
        { model: "gpt-image-2-low-1k", created_at: "2026-07-24T05:00:00.000Z" },
        {
          model: "gemini-3.1-flash-image-preview-1024",
          created_at: "2026-07-26T05:00:00.000Z",
        },
      ],
      CURRENT_START,
      NOW
    );

    const [first, , last] = result.days;

    expect(first.openaiJpy).toBeCloseTo(GPT_LOW_USD * USD_JPY_RATE, 1);
    expect(first.googleJpy).toBe(0);
    expect(last.googleJpy).toBeCloseTo(GEMINI_FLASH_USD * USD_JPY_RATE, 1);
    expect(last.openaiJpy).toBe(0);
    expect(last.totalJpy).toBeCloseTo(last.googleJpy, 1);
  });

  it("JST日付でバケットを決める(UTC 15時は翌日のJST扱い)", () => {
    const result = buildAiCostEstimate(
      [
        // 2026-07-24T15:00Z = 2026-07-25 00:00 JST
        { model: "gpt-image-2-low-1k", created_at: "2026-07-24T15:00:00.000Z" },
      ],
      CURRENT_START,
      NOW
    );

    const jul24 = result.days.find((day) => day.bucket === "2026-07-24");
    const jul25 = result.days.find((day) => day.bucket === "2026-07-25");

    expect(jul24?.totalJpy).toBe(0);
    expect(jul25?.totalJpy).toBeCloseTo(GPT_LOW_USD * USD_JPY_RATE, 1);
  });

  it("期間外の生成は集計しない", () => {
    const result = buildAiCostEstimate(
      [
        { model: "gpt-image-2-low-1k", created_at: "2026-07-01T00:00:00.000Z" },
        { model: "gpt-image-2-low-1k", created_at: "2026-07-25T00:00:00.000Z" },
      ],
      CURRENT_START,
      NOW
    );

    expect(result.totalUsd).toBeCloseTo(GPT_LOW_USD, 4);
    expect(result.byModel[0]?.count).toBe(1);
  });

  it("単価未設定(nullと未知モデル)は金額に含めず件数だけ返す", () => {
    const result = buildAiCostEstimate(
      [
        { model: null, created_at: "2026-07-25T00:00:00.000Z" },
        { model: "unknown-model-x", created_at: "2026-07-25T00:00:00.000Z" },
        { model: "gpt-image-2-low-1k", created_at: "2026-07-25T00:00:00.000Z" },
      ],
      CURRENT_START,
      NOW
    );

    expect(result.unknownModelCount).toBe(2);
    expect(result.totalUsd).toBeCloseTo(GPT_LOW_USD, 4);
    expect(result.byModel).toHaveLength(1);
    expect(result.byModel[0]?.model).toBe("gpt-image-2-low-1k");
  });

  it("モデル別内訳は金額降順で、プロバイダラベルを持つ", () => {
    const result = buildAiCostEstimate(
      [
        { model: "gpt-image-2-low-1k", created_at: "2026-07-25T00:00:00.000Z" },
        {
          model: "gemini-3.1-flash-image-preview-1024",
          created_at: "2026-07-25T00:00:00.000Z",
        },
      ],
      CURRENT_START,
      NOW
    );

    expect(result.byModel.map((item) => item.model)).toEqual([
      "gemini-3.1-flash-image-preview-1024",
      "gpt-image-2-low-1k",
    ]);
    expect(result.byModel[0]?.providerLabel).toBe("Google");
    expect(result.byModel[1]?.providerLabel).toBe("OpenAI");
    expect(result.byModel[1]?.count).toBe(1);
  });

  it("換算レートの注記を返す", () => {
    const result = buildAiCostEstimate([], CURRENT_START, NOW);
    expect(result.rateNote).toContain(String(USD_JPY_RATE));
  });
});
