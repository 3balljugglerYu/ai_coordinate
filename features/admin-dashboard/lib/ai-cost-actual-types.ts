/**
 * AI 原価カードに併記する「実額」の型（ADR-002 / ADR-004）。
 *
 * 実額は各プラットフォームの請求データが出典で、DB には保存しない。
 * 未設定(not_configured)・失敗(error)でも推定表示は維持する。
 */

export type AiCostActualStatus = "ready" | "not_configured" | "error";

export interface AiCostActualEntry {
  provider: "openai" | "google";
  providerLabel: string;
  status: AiCostActualStatus;
  /** status=ready のときの期間内合計（円換算後） */
  totalJpy: number | null;
  /** 元通貨の合計（USD 建てなら USD、円請求ならそのまま円） */
  totalOriginal: number | null;
  originalCurrency: string | null;
  message: string | null;
}

export interface AiCostActuals {
  entries: AiCostActualEntry[];
  /** すべて not_configured のときは実額行自体を表示しない */
  hasAnyConfigured: boolean;
}
