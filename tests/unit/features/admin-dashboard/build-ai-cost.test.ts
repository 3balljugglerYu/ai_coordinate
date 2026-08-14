import { buildAiCostEstimate } from "@/features/admin-dashboard/lib/build-ai-cost";
import {
  estimateGenerationCost,
  MODEL_COST_RATES,
  USD_JPY_RATE,
} from "@/features/admin-dashboard/lib/ai-cost-rates";

// 固定ウィンドウ(3日): current=[07-24T00:00Z, 07-26T12:00Z]
const NOW = new Date("2026-07-26T12:00:00.000Z");
const CURRENT_START = new Date("2026-07-24T00:00:00.000Z");

/*
  期待値は「出力 ＋ 入力画像 ＋ プロンプト」の合計（ADR-005）。
  出力ぶんだけを数えていた頃の 0.006 とは別物なので、数字を直に置いて
  単価表が静かに変わったときに気づけるようにする。
*/
const GPT_INPUT_IMAGE_USD = 0.011968; //           1,496 tok × $8/1M（品質によらず一定）
const GPT_LOW_OUTPUT_USD = 0.00516; //               172 tok × $30/1M
// generation_type 未指定 → 既定 370 tok
const GPT_LOW_DEFAULT_USD = GPT_LOW_OUTPUT_USD + GPT_INPUT_IMAGE_USD + 0.00185;
// one_tap_style → 1,640 tok
const GPT_LOW_ONE_TAP_USD = GPT_LOW_OUTPUT_USD + GPT_INPUT_IMAGE_USD + 0.0082;
// Gemini はテキストぶん未計上、入力画像も flash 系は未公表なので出力ぶんのみ
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

    const expectedUsd = GPT_LOW_DEFAULT_USD * 2 + GEMINI_FLASH_USD;
    expect(result.totalUsd).toBeCloseTo(expectedUsd, 4);
    expect(result.totalJpy).toBeCloseTo(expectedUsd * USD_JPY_RATE, 1);
  });

  describe("入力ぶんの計上（ADR-005）", () => {
    it("入力画像ぶんを必ず加算する（出力ぶんだけでは実額に届かない）", () => {
      // Low は出力が 172 tok しかなく、原価の7割が入力画像。
      // 出力ぶん(0.00516)だけを数えていた頃は実額の 1/3 だった
      const result = buildAiCostEstimate(
        [{ model: "gpt-image-2-low-1k", created_at: "2026-07-25T01:00:00.000Z" }],
        CURRENT_START,
        NOW
      );

      expect(result.totalUsd).toBeGreaterThan(GPT_LOW_OUTPUT_USD * 3);
      // 戻り値は小数4桁に丸められるので、突き合わせもその精度で行う
      expect(result.totalUsd).toBeCloseTo(GPT_LOW_DEFAULT_USD, 4);
    });

    it("generation_type ごとにプロンプトのトークン数を変える", () => {
      // One-Tap Style は運営登録のプリセット本文を含み平均 7,556 文字
      const oneTap = buildAiCostEstimate(
        [
          {
            model: "gpt-image-2-low-1k",
            created_at: "2026-07-25T01:00:00.000Z",
            generation_type: "one_tap_style",
          },
        ],
        CURRENT_START,
        NOW
      );
      const coordinate = buildAiCostEstimate(
        [
          {
            model: "gpt-image-2-low-1k",
            created_at: "2026-07-25T01:00:00.000Z",
            generation_type: "coordinate",
          },
        ],
        CURRENT_START,
        NOW
      );

      expect(oneTap.totalUsd).toBeCloseTo(GPT_LOW_ONE_TAP_USD, 4);
      expect(oneTap.totalUsd).toBeGreaterThan(coordinate.totalUsd);
    });

    it("Gemini にはテキストぶんを乗せない（単価未確認のため）", () => {
      const withType = buildAiCostEstimate(
        [
          {
            model: "gemini-3.1-flash-image-preview-1024",
            created_at: "2026-07-25T01:00:00.000Z",
            generation_type: "one_tap_style",
          },
        ],
        CURRENT_START,
        NOW
      );

      expect(withType.totalUsd).toBeCloseTo(GEMINI_FLASH_USD, 5);
    });
  });

  describe("単価表の網羅性", () => {
    it("実データに現れる model 値がすべて登録されている", () => {
      // 未登録だと原価が丸ごと0円として消える。
      // 2026-08-14 以前は 2k/4k と gemini-2.5-flash-image / -512 が漏れていた
      const modelsInProduction = [
        "gpt-image-2-low-1k",
        "gpt-image-2-medium-1k",
        "gpt-image-2-high-1k",
        "gpt-image-2-low-2k",
        "gpt-image-2-medium-2k",
        "gpt-image-2-high-2k",
        "gpt-image-2-low-4k",
        "gpt-image-2-medium-4k",
        "gpt-image-2-high-4k",
        "gpt-image-2-low",
        "gemini-2.5-flash-image",
        "gemini-3.1-flash-image-preview-512",
        "gemini-3.1-flash-image-preview-1024",
        "gemini-3-pro-image-1k",
        "gemini-3-pro-image-2k",
        "gemini-3-pro-image-4k",
      ];

      for (const model of modelsInProduction) {
        expect(MODEL_COST_RATES[model]).toBeDefined();
      }
    });

    it("品質が上がるほど原価も上がる", () => {
      const cost = (model: string) =>
        estimateGenerationCost(model, "one_tap_style")!.usd;

      expect(cost("gpt-image-2-low-1k")).toBeLessThan(
        cost("gpt-image-2-medium-1k")
      );
      expect(cost("gpt-image-2-medium-1k")).toBeLessThan(
        cost("gpt-image-2-high-1k")
      );
    });

    it("外挿した 2k/4k は basis で見分けられる", () => {
      // 実測していないことをカード側と将来の読み手に明示する
      expect(MODEL_COST_RATES["gpt-image-2-low-1k"]?.basis).toBe("measured");
      expect(MODEL_COST_RATES["gpt-image-2-high-4k"]?.basis).toBe("derived");
      expect(MODEL_COST_RATES["gemini-3-pro-image-1k"]?.basis).toBe("published");
    });
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

    expect(first.openaiJpy).toBeCloseTo(GPT_LOW_DEFAULT_USD * USD_JPY_RATE, 1);
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
    expect(jul25?.totalJpy).toBeCloseTo(GPT_LOW_DEFAULT_USD * USD_JPY_RATE, 1);
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

    expect(result.totalUsd).toBeCloseTo(GPT_LOW_DEFAULT_USD, 4);
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
    expect(result.totalUsd).toBeCloseTo(GPT_LOW_DEFAULT_USD, 4);
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
