/**
 * Cloud Billing の BigQuery エクスポートから Gemini(Generative Language API)の
 * 実請求額を集計するクエリビルダー(純粋・I/O なし)。
 *
 * 課金エクスポートの標準テーブルは `gcp_billing_export_v1_<BILLING_ACCOUNT_ID>` で、
 * 1行が「サービス×SKU×利用日×プロジェクト」の課金明細。cost は請求通貨建て。
 * credits は割引・無料枠で、実支払額は cost + SUM(credits.amount)。
 *
 * 参考: https://cloud.google.com/billing/docs/how-to/bq-examples
 */

/** Gemini API の課金サービス名（実データの表記に合わせて調整可能） */
export const GEMINI_SERVICE_DESCRIPTIONS = [
  "Generative Language API",
  "Gemini API",
];

/**
 * 期間内の Gemini 実額合計を返すクエリ。
 * `usage_start_time` で期間を絞り、credits を差し引いた実支払額を通貨ごとに返す。
 */
export function buildGeminiBillingCostQuery(
  projectId: string,
  datasetId: string,
  tableName: string
): string {
  return `
    SELECT
      currency,
      SUM(cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS totalCost
    FROM \`${projectId}.${datasetId}.${tableName}\`
    WHERE usage_start_time >= TIMESTAMP(@startTimestamp)
      AND usage_start_time < TIMESTAMP(@endTimestamp)
      AND service.description IN UNNEST(@serviceDescriptions)
    GROUP BY currency
  `;
}

/**
 * 課金エクスポートのテーブル名を探すクエリ。
 * テーブル名に請求先アカウント ID が含まれるため、固定名で決め打ちしない。
 */
export function buildBillingTableLookupQuery(
  projectId: string,
  datasetId: string
): string {
  return `
    SELECT table_name
    FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.TABLES\`
    WHERE table_name LIKE 'gcp_billing_export_v1_%'
    ORDER BY table_name
    LIMIT 1
  `;
}

/**
 * BigQuery の数値カラム（BigQueryNumeric や文字列で返ることがある）を数値化する。
 */
export function parseBillingCost(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (value && typeof value === "object" && "value" in value) {
    return parseBillingCost((value as { value: unknown }).value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
