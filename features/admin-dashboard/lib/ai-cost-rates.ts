/**
 * AI 画像生成の推定原価に使う単価表と換算レート（ADR-001 / ADR-003）。
 *
 * 単価は各社の公式料金ページから転記した「1生成あたりの USD」。
 * 単価改定・モデル追加時はここを更新して PR を出す（DB や管理画面では持たない）。
 *
 * 出典（2026-07-26 取得）:
 * - OpenAI: https://developers.openai.com/api/docs/guides/image-generation
 *   gpt-image-2 1024x1024 → low $0.006 / medium $0.053 / high $0.211
 * - Google: https://ai.google.dev/gemini-api/docs/pricing
 *   gemini-3.1-flash-image $0.067 / 1K image、gemini-3-pro-image $0.134 / 1K・2K image、
 *   gemini-3.1-flash-lite-image $0.0336 / 1K image
 */

export type AiCostProvider = "openai" | "google";

export interface AiModelRate {
  /** 1生成あたりの USD 単価 */
  unitCostUsd: number;
  provider: AiCostProvider;
}

/**
 * generated_images.model に記録される値をキーにした単価表。
 * 実データに存在する値を基準に定義し、未知のキーは「単価未設定」として金額に含めない。
 */
export const MODEL_COST_RATES: Record<string, AiModelRate> = {
  "gpt-image-2-low-1k": { unitCostUsd: 0.006, provider: "openai" },
  "gpt-image-2-medium-1k": { unitCostUsd: 0.053, provider: "openai" },
  "gpt-image-2-high-1k": { unitCostUsd: 0.211, provider: "openai" },
  "gemini-3.1-flash-image-preview-1024": {
    unitCostUsd: 0.067,
    provider: "google",
  },
  "gemini-3.1-flash-lite-image-1024": {
    unitCostUsd: 0.0336,
    provider: "google",
  },
  "gemini-3-pro-image-1k": { unitCostUsd: 0.134, provider: "google" },
};

/**
 * USD→JPY の固定換算レート（ADR-003）。
 * 原価把握が用途のため為替 API には依存せず、注記付きで固定値を使う。
 */
export const USD_JPY_RATE = 155;

/** カードに表示する換算レートの注記 */
export const USD_JPY_RATE_NOTE = `$1=¥${USD_JPY_RATE} 固定換算`;

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

export function usdToJpy(usd: number): number {
  return usd * USD_JPY_RATE;
}
