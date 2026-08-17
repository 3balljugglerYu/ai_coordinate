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
/*
  Gemini も 2026-08-18 から3要素すべてを数える。
  入力はテキストも画像も同一単価（flash は $0.50/1M）で、
  入力画像は media_resolution 既定の 1,120 tok。
*/
const GEMINI_FLASH_INPUT_IMAGE_USD = (1120 * 0.5) / 1e6; // = 0.00056
// generation_type 未指定 → 既定 370 tok
const GEMINI_FLASH_DEFAULT_USD =
  0.067 + GEMINI_FLASH_INPUT_IMAGE_USD + (370 * 0.5) / 1e6;
// one_tap_style → 1,640 tok
const GEMINI_FLASH_ONE_TAP_USD =
  0.067 + GEMINI_FLASH_INPUT_IMAGE_USD + (1640 * 0.5) / 1e6;

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
        { model: "gpt-image-2-low-1k", created_at: "2026-07-25T01:00:00.000Z", generation_type: null },
        { model: "gpt-image-2-low-1k", created_at: "2026-07-25T02:00:00.000Z", generation_type: null },
        {
          model: "gemini-3.1-flash-image-preview-1024",
          created_at: "2026-07-25T03:00:00.000Z",
          generation_type: null,
        },
      ],
      CURRENT_START,
      NOW
    );

    const expectedUsd = GPT_LOW_DEFAULT_USD * 2 + GEMINI_FLASH_DEFAULT_USD;
    expect(result.totalUsd).toBeCloseTo(expectedUsd, 4);
    expect(result.totalJpy).toBeCloseTo(expectedUsd * USD_JPY_RATE, 1);
  });

  describe("入力ぶんの計上（ADR-005）", () => {
    it("入力画像ぶんを必ず加算する（出力ぶんだけでは実額に届かない）", () => {
      // Low は出力が 172 tok しかなく、原価の7割が入力画像。
      // 出力ぶん(0.00516)だけを数えていた頃は実額の 1/3 だった
      const result = buildAiCostEstimate(
        [{ model: "gpt-image-2-low-1k", created_at: "2026-07-25T01:00:00.000Z", generation_type: null }],
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

    it("同じジョブの複数枚は入力ぶんを1回しか数えない", () => {
      // OpenAI は n 枚を1リクエストで返すので、入力画像・プロンプトの課金は
      // リクエストにつき1回。行ごとに足すと4枚生成で入力ぶんが4倍になる
      const fourImages = buildAiCostEstimate(
        Array.from({ length: 4 }, () => ({
          model: "gpt-image-2-low-1k",
          created_at: "2026-07-25T01:00:00.000Z",
          generation_type: "one_tap_style",
          image_job_id: "job-1",
        })),
        CURRENT_START,
        NOW
      );

      const inputUsd = GPT_INPUT_IMAGE_USD + 0.0082;
      const expected = GPT_LOW_OUTPUT_USD * 4 + inputUsd;

      expect(fourImages.totalUsd).toBeCloseTo(expected, 4);
      // 行ごとに全額を足していた頃の値より確実に小さい
      expect(fourImages.totalUsd).toBeLessThan(GPT_LOW_ONE_TAP_USD * 4);
      expect(fourImages.byModel[0]?.count).toBe(4);
    });

    it("別ジョブなら入力ぶんをそれぞれ数える", () => {
      const twoJobs = buildAiCostEstimate(
        [
          {
            model: "gpt-image-2-low-1k",
            created_at: "2026-07-25T01:00:00.000Z",
            generation_type: "one_tap_style",
            image_job_id: "job-1",
          },
          {
            model: "gpt-image-2-low-1k",
            created_at: "2026-07-25T02:00:00.000Z",
            generation_type: "one_tap_style",
            image_job_id: "job-2",
          },
        ],
        CURRENT_START,
        NOW
      );

      expect(twoJobs.totalUsd).toBeCloseTo(GPT_LOW_ONE_TAP_USD * 2, 4);
    });

    it("image_job_id が null の行は、その行だけで1リクエスト扱い", () => {
      // 同期経路(ゲスト・One-Tap 同期)と旧データ。まとめてしまうと過小計上になる
      const syncRows = buildAiCostEstimate(
        [
          {
            model: "gpt-image-2-low-1k",
            created_at: "2026-07-25T01:00:00.000Z",
            generation_type: "one_tap_style",
            image_job_id: null,
          },
          {
            model: "gpt-image-2-low-1k",
            created_at: "2026-07-25T02:00:00.000Z",
            generation_type: "one_tap_style",
            image_job_id: null,
          },
        ],
        CURRENT_START,
        NOW
      );

      expect(syncRows.totalUsd).toBeCloseTo(GPT_LOW_ONE_TAP_USD * 2, 4);
    });

    it("Gemini もモデル別の入力単価でテキストぶんを計上する", () => {
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

      // buildAiCostEstimate は合計を丸めるため精度4で比較する
      expect(withType.totalUsd).toBeCloseTo(GEMINI_FLASH_ONE_TAP_USD, 4);
      // 出力ぶんだけの頃(0.067)より高い = テキスト・入力画像を数えている
      expect(withType.totalUsd).toBeGreaterThan(0.067);
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

    it("完走フィード投稿は原価にも単価未設定にも数えない", () => {
      // 台紙の合成画像でモデルを呼んでいない。単価未設定に混ぜると
      // 「取りこぼしている件数」に見えて判断を誤らせる。
      const result = buildAiCostEstimate(
        [
          {
            model: null,
            created_at: "2026-07-25T01:00:00.000Z",
            generation_type: "one_tap_style",
            completion_id: "11111111-1111-1111-1111-111111111111",
          },
          {
            // completion_id が無い model=null は従来どおり単価未設定
            model: null,
            created_at: "2026-07-25T02:00:00.000Z",
            generation_type: "one_tap_style",
          },
        ],
        CURRENT_START,
        NOW
      );

      expect(result.totalUsd).toBe(0);
      expect(result.unknownModelCount).toBe(1);
    });

    it("すべてのモデルが入力ぶんを計上している", () => {
      // inputCompleteness=partial が残っていると、そのモデルの合計は実額に届かない。
      // 2026-08-18 に Gemini のテキスト・入力画像を計上して全モデル counted になった。
      for (const [model, rate] of Object.entries(MODEL_COST_RATES)) {
        expect([model, rate.inputCompleteness]).toEqual([model, "counted"]);
        expect(rate.inputImageUsd).toBeGreaterThan(0);
        expect(rate.textInputUsdPer1M).toBeGreaterThan(0);
      }
    });

    it("Gemini はモデル階層ごとに入力単価が違う", () => {
      // pro $2.00 / flash $0.50 / flash-lite $0.25。
      // provider 単位の定数にすると 8倍の開きを潰してしまう。
      expect(MODEL_COST_RATES["gemini-3-pro-image-1k"]?.textInputUsdPer1M).toBe(2.0);
      expect(
        MODEL_COST_RATES["gemini-3.1-flash-image-preview-1024"]?.textInputUsdPer1M
      ).toBe(0.5);
      expect(
        MODEL_COST_RATES["gemini-3.1-flash-lite-image-1024"]?.textInputUsdPer1M
      ).toBe(0.25);
    });

    it("Gemini 3 の入力画像は media_resolution 既定の 1,120 tok で数える", () => {
      // 価格ページの「$0.0011/枚」は 560 tok(MEDIUM)前提で、既定の半分。
      // アプリは media_resolution を指定していないので既定が効く。
      expect(MODEL_COST_RATES["gemini-3-pro-image-1k"]?.inputImageUsd).toBeCloseTo(
        (1120 * 2.0) / 1e6,
        6
      );
      expect(
        MODEL_COST_RATES["gemini-3-pro-image-1k"]?.inputImageUsd
      ).toBeGreaterThan(0.0011);
    });

    it("Gemini でも出力ぶんが原価の大半を占める(OpenAI Low とは逆)", () => {
      // OpenAI Low は入力が7割。Gemini は出力単価が高く入力単価が安いため、
      // 入力を計上しても合計は数%しか動かない。値付けの直感を固定しておく。
      const cost = estimateGenerationCost("gemini-3-pro-image-1k", "one_tap_style")!;
      expect(cost.inputUsd / cost.usd).toBeLessThan(0.05);

      const low = estimateGenerationCost("gpt-image-2-low-1k", "one_tap_style")!;
      expect(low.inputUsd / low.usd).toBeGreaterThan(0.7);
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
        { model: "gpt-image-2-low-1k", created_at: "2026-07-24T05:00:00.000Z", generation_type: null },
        {
          model: "gemini-3.1-flash-image-preview-1024",
          created_at: "2026-07-26T05:00:00.000Z",
          generation_type: null,
        },
      ],
      CURRENT_START,
      NOW
    );

    const [first, , last] = result.days;

    expect(first.openaiJpy).toBeCloseTo(GPT_LOW_DEFAULT_USD * USD_JPY_RATE, 1);
    expect(first.googleJpy).toBe(0);
    expect(last.googleJpy).toBeCloseTo(GEMINI_FLASH_DEFAULT_USD * USD_JPY_RATE, 1);
    expect(last.openaiJpy).toBe(0);
    expect(last.totalJpy).toBeCloseTo(last.googleJpy, 1);
  });

  it("JST日付でバケットを決める(UTC 15時は翌日のJST扱い)", () => {
    const result = buildAiCostEstimate(
      [
        // 2026-07-24T15:00Z = 2026-07-25 00:00 JST
        { model: "gpt-image-2-low-1k", created_at: "2026-07-24T15:00:00.000Z", generation_type: null },
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
        { model: "gpt-image-2-low-1k", created_at: "2026-07-01T00:00:00.000Z", generation_type: null },
        { model: "gpt-image-2-low-1k", created_at: "2026-07-25T00:00:00.000Z", generation_type: null },
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
        { model: null, created_at: "2026-07-25T00:00:00.000Z", generation_type: null },
        { model: "unknown-model-x", created_at: "2026-07-25T00:00:00.000Z", generation_type: null },
        { model: "gpt-image-2-low-1k", created_at: "2026-07-25T00:00:00.000Z", generation_type: null },
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
        { model: "gpt-image-2-low-1k", created_at: "2026-07-25T00:00:00.000Z", generation_type: null },
        {
          model: "gemini-3.1-flash-image-preview-1024",
          created_at: "2026-07-25T00:00:00.000Z",
          generation_type: null,
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
