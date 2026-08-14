/**
 * AI 画像生成の推定原価に使う単価表と換算レート（ADR-001 / ADR-003 / ADR-005）。
 *
 * ## 1生成の原価は3つの合計でできている
 *
 *   出力画像トークン ＋ 入力画像トークン ＋ 入力テキストトークン
 *
 * 以前はこのうち **出力ぶんしか数えていなかった**。Persta は必ず `images/edits` に
 * 入力画像を送り、しかも One-Tap Style は数千文字のプロンプトを送るため、
 * Low 品質では原価の 7割以上が入力ぶんで、実額の 1/3 しか計上できていなかった。
 * 2026-08-14 に実測して是正した（ADR-005）。
 *
 * ## gpt-image-2 の値は実測（2026-08-14）
 *
 * 本番と同じ正規化をかけた入力画像(1592x2048) 1枚と、アプリが実際に指定する
 * 出力サイズ(1104x1424) で `images/edits` を叩き、レスポンスの `usage` を読んだ。
 *
 *   入力画像 : 1,496 tok（**品質・出力サイズによらず一定**）
 *   出力画像 : low 172 / medium 1,587 / high 6,345 tok
 *
 * 再測定するときは `.local/measure-openai-cost.mjs` を使う（手順は ADR-005 参照）。
 *
 * ## トークン単価（per 1M tokens）
 *
 * 出典（2026-08-14 取得）:
 * - OpenAI: https://developers.openai.com/api/docs/pricing
 *   gpt-image-2 → text input $5 / image input $8 / image output $30
 * - Google: https://ai.google.dev/gemini-api/docs/pricing
 *   1枚あたりの価格が公表されているのでそちらを使う
 */

export type AiCostProvider = "openai" | "google";

/**
 * その単価をどこから得たか。カードで「推定の確からしさ」を説明するために持つ。
 *
 * - `measured`  実際に API を叩いて usage を読んだ値（最も確か）
 * - `published` 各社が公表している1枚あたりの価格
 * - `derived`   実測値からの外挿。**検証していない**
 */
export type AiRateBasis = "measured" | "published" | "derived";

/**
 * 入力ぶん（入力画像＋プロンプト）をどこまで数えられているか。
 *
 * `basis` とは**別の軸**として持つ。出力ぶんが公表値で正確でも、
 * 入力ぶんが未計上なら合計は実額に届かないため、片方だけでは実態を表せない。
 *
 * - `counted` 入力画像・プロンプトとも計上している（OpenAI）
 * - `partial` 一部だけ計上している（Gemini: テキスト単価が未確認で常に未計上。
 *   flash 系は入力画像の公表もない）
 */
export type AiInputCompleteness = "counted" | "partial";

export interface AiModelRate {
  /** 出力画像ぶんの1生成あたり USD */
  outputUsd: number;
  /**
   * 入力画像1枚ぶんの USD。
   * `0` は「課金されない」ではなく **「未計測」** を意味し、その分だけ原価を低く見ている。
   */
  inputImageUsd: number;
  provider: AiCostProvider;
  basis: AiRateBasis;
  inputCompleteness: AiInputCompleteness;
}

/** OpenAI のテキスト入力単価（per 1M tokens）。 */
export const OPENAI_TEXT_INPUT_USD_PER_1M = 5.0;
const OPENAI_IMAGE_INPUT_USD_PER_1M = 8.0;
const OPENAI_IMAGE_OUTPUT_USD_PER_1M = 30.0;

// --- gpt-image-2 の実測値（2026-08-14） ---

/** 入力画像のトークン数。**品質にも出力サイズにも依存しない固定費**。 */
const GPT_IMAGE_2_INPUT_IMAGE_TOKENS = 1496;
const GPT_IMAGE_2_INPUT_IMAGE_USD =
  (GPT_IMAGE_2_INPUT_IMAGE_TOKENS * OPENAI_IMAGE_INPUT_USD_PER_1M) / 1e6;

/** 出力画像のトークン数（1k tier・出力 1104x1424 で実測）。 */
const GPT_IMAGE_2_OUTPUT_TOKENS_1K = {
  low: 172,
  medium: 1587,
  high: 6345,
} as const;

type GptImage2Quality = keyof typeof GPT_IMAGE_2_OUTPUT_TOKENS_1K;
type GptImage2Tier = "1k" | "2k" | "4k";

/**
 * tier ごとのピクセル上限比（GPT_IMAGE_2_TIER_LIMITS と同じ値）。
 * 1k=1,572,864 / 2k=4,194,304 / 4k=8,294,400 px。
 */
const TIER_PIXEL_RATIO: Record<GptImage2Tier, number> = {
  "1k": 1,
  "2k": 4194304 / 1572864,
  "4k": 8294400 / 1572864,
};

/**
 * 2k / 4k は 1k の実測値をピクセル比で外挿する。**実測していない。**
 *
 * 直近30日の利用が 4件（全体の0.3%）しかなく、実測に必要な API 実費（約 $1.9）に
 * 見合わないと判断した。精度が要るときは実測して置き換えること。
 * なお 1k の実測では「出力サイズを 1.5倍にしても出力トークンは増えなかった」ため、
 * このピクセル比例の仮定は**過大側に振れている可能性が高い**。
 */
const gptImage2 = (
  quality: GptImage2Quality,
  tier: GptImage2Tier
): AiModelRate => {
  const tokens = Math.round(
    GPT_IMAGE_2_OUTPUT_TOKENS_1K[quality] * TIER_PIXEL_RATIO[tier]
  );
  return {
    outputUsd: (tokens * OPENAI_IMAGE_OUTPUT_USD_PER_1M) / 1e6,
    inputImageUsd: GPT_IMAGE_2_INPUT_IMAGE_USD,
    provider: "openai",
    basis: tier === "1k" ? "measured" : "derived",
    inputCompleteness: "counted",
  };
};

/**
 * Gemini は出力ぶんの公表値のみ。テキスト入力単価が未確認で常に未計上、
 * 入力画像も pro 以外は公表がないため `partial` 固定。
 */
const gemini = (outputUsd: number, inputImageUsd = 0): AiModelRate => ({
  outputUsd,
  inputImageUsd,
  provider: "google",
  basis: "published",
  inputCompleteness: "partial",
});

/** gemini-3-pro-image の入力画像は 560 tok = $0.0011/枚（公表値）。他モデルは未公表。 */
const GEMINI_PRO_INPUT_IMAGE_USD = 0.0011;

/**
 * `generated_images.model` に記録される値をキーにした単価表。
 *
 * **実データに存在する model 値はすべて登録すること。** 未登録のキーは
 * `getModelRate()` が null を返し、`buildAiCostEstimate` が金額に含めないため、
 * そのモデルの原価が丸ごと 0 円として消える（2026-08-14 以前は 2k/4k と
 * gemini-2.5-flash-image / -512 がこの状態だった）。
 */
export const MODEL_COST_RATES: Record<string, AiModelRate> = {
  // --- OpenAI gpt-image-2（1k は実測 / 2k・4k は外挿）---
  "gpt-image-2-low-1k": gptImage2("low", "1k"),
  "gpt-image-2-medium-1k": gptImage2("medium", "1k"),
  "gpt-image-2-high-1k": gptImage2("high", "1k"),
  "gpt-image-2-low-2k": gptImage2("low", "2k"),
  "gpt-image-2-medium-2k": gptImage2("medium", "2k"),
  "gpt-image-2-high-2k": gptImage2("high", "2k"),
  "gpt-image-2-low-4k": gptImage2("low", "4k"),
  "gpt-image-2-medium-4k": gptImage2("medium", "4k"),
  "gpt-image-2-high-4k": gptImage2("high", "4k"),
  // 旧データに残る legacy alias（正規化前の値がそのまま保存されている）
  "gpt-image-2-low": gptImage2("low", "1k"),

  // --- Google（公表されている1枚あたりの価格）---
  "gemini-2.5-flash-image": gemini(0.039),
  "gemini-3.1-flash-image-preview-512": gemini(0.045),
  "gemini-3.1-flash-image-preview-1024": gemini(0.067),
  "gemini-3.1-flash-lite-image-1024": gemini(0.0336),
  "gemini-3-pro-image-1k": gemini(0.134, GEMINI_PRO_INPUT_IMAGE_USD),
  "gemini-3-pro-image-2k": gemini(0.134, GEMINI_PRO_INPUT_IMAGE_USD),
  "gemini-3-pro-image-4k": gemini(0.24, GEMINI_PRO_INPUT_IMAGE_USD),
};

/**
 * `generated_images.generation_type` ごとの、送信プロンプトの推定トークン数。
 *
 * 実測できているのは one_tap_style だけ。`generation_prompt_snapshots` に
 * 組み立て済みの全文が残るのがこの経路だけだからで、他は「定型文の実文字数
 * ＋ 記録済みユーザー入力の平均」から見積もっている（約4.3〜4.6文字/tok）。
 *
 *   one_tap_style : 全文 平均 7,556字（DB実測 680件。大半は運営登録のプリセット本文）
 *   free          : 定型 1,245字 ＋ ユーザー入力 平均 2,019字
 *   coordinate    : 定型 約1,500字 ＋ ユーザー入力 平均 87字
 *   inspire       : 定型が最も短い経路
 *
 * ここは推定要素が最も大きい。テキストは $5/1M と3つの単価で最も安く、
 * Low でも原価の2割程度なので、多少ずれても全体への影響は限定的。
 */
export const PROMPT_TEXT_TOKENS_BY_GENERATION_TYPE: Record<string, number> = {
  one_tap_style: 1640,
  free: 760,
  coordinate: 370,
  inspire: 200,
};

/** generation_type が不明・未知のときに使うトークン数（coordinate 相当）。 */
export const DEFAULT_PROMPT_TEXT_TOKENS = 370;

/**
 * USD→JPY の固定換算レート（ADR-003）。
 * 原価把握が用途のため為替 API には依存せず、注記付きで固定値を使う。
 */
export const USD_JPY_RATE = 155;

/** カードに表示する換算レートの注記 */
export const USD_JPY_RATE_NOTE = `$1=¥${USD_JPY_RATE} 固定換算・入力画像とプロンプトのトークンを含む`;

export const PROVIDER_LABELS: Record<AiCostProvider, string> = {
  openai: "OpenAI",
  google: "Google",
};

/**
 * 色はプロバイダ（エンティティ）に固定で割り当てる。系列数や並び順で色を回さない。
 * 隣接ペアの CVD 分離を検証済みの組み合わせ。
 */
export const PROVIDER_CHART_COLORS: Record<AiCostProvider, string> = {
  openai: "#3B82F6",
  google: "#EC4899",
};

export function getModelRate(model: string | null): AiModelRate | null {
  if (!model) return null;
  return MODEL_COST_RATES[model] ?? null;
}

/** generation_type からプロンプトの推定トークン数を引く。 */
export function getPromptTextTokens(generationType: string | null): number {
  if (!generationType) return DEFAULT_PROMPT_TEXT_TOKENS;
  return (
    PROMPT_TEXT_TOKENS_BY_GENERATION_TYPE[generationType] ??
    DEFAULT_PROMPT_TEXT_TOKENS
  );
}

export interface AiGenerationCost {
  provider: AiCostProvider;
  basis: AiRateBasis;
  inputCompleteness: AiInputCompleteness;
  /** 出力画像ぶん。**画像1枚ごと**にかかる */
  outputUsd: number;
  /**
   * 入力ぶん（入力画像 ＋ プロンプト）。
   *
   * **リクエスト1回につき1度だけ**かかる。OpenAI は `n` 枚をまとめて1リクエストで
   * 返すため、生成画像の行数ぶん掛けてはいけない（呼び出し側でジョブ単位に寄せる）。
   */
  inputUsd: number;
  /** 1リクエスト＝1枚のときの合計 */
  usd: number;
}

/**
 * 1生成あたりの推定原価を、入力ぶんを含めて算出する。
 * 単価表に無いモデルは `null`（呼び出し側で「単価未設定」として件数だけ数える）。
 *
 * テキストぶんは OpenAI のみ計上する。Gemini のテキスト入力単価は未確認で、
 * 直近30日の Gemini 利用が全体の約1%しかないため、まず OpenAI を正確にした。
 */
export function estimateGenerationCost(
  model: string | null,
  generationType: string | null
): AiGenerationCost | null {
  const rate = getModelRate(model);
  if (!rate) return null;

  const textUsd =
    rate.provider === "openai"
      ? (getPromptTextTokens(generationType) * OPENAI_TEXT_INPUT_USD_PER_1M) / 1e6
      : 0;

  const inputUsd = rate.inputImageUsd + textUsd;

  return {
    provider: rate.provider,
    basis: rate.basis,
    inputCompleteness: rate.inputCompleteness,
    outputUsd: rate.outputUsd,
    inputUsd,
    usd: rate.outputUsd + inputUsd,
  };
}

export function usdToJpy(usd: number): number {
  return usd * USD_JPY_RATE;
}
