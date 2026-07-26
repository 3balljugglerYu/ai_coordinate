import "server-only";

import { env } from "@/lib/env";
import { getGa4BigQueryClient } from "@/features/analytics/lib/ga4-bigquery-client";
import { usdToJpy } from "./ai-cost-rates";
import {
  buildBillingTableLookupQuery,
  buildGeminiBillingCostQuery,
  GEMINI_SERVICE_DESCRIPTIONS,
  parseBillingCost,
} from "./billing-bigquery-query";
import type { AiCostActualEntry } from "./ai-cost-actual-types";

interface BillingCostRow {
  currency?: string | null;
  totalCost?: unknown;
}

export function isGeminiBillingConfigured(): boolean {
  return Boolean(
    env.BILLING_BIGQUERY_DATASET &&
      env.GA4_BIGQUERY_PROJECT_ID &&
      env.GA4_SERVICE_ACCOUNT_JSON_BASE64
  );
}

/**
 * Cloud Billing の BigQuery エクスポートから Gemini の実請求額を取得する。
 *
 * 課金エクスポートは有効化以降のデータしか存在せず、反映も数時間〜1日遅れる。
 * 未設定・失敗時は推定表示を壊さないよう status で返す（ADR-004）。
 */
export async function fetchGeminiActualCost(
  start: Date,
  end: Date
): Promise<AiCostActualEntry> {
  const base: Omit<AiCostActualEntry, "status" | "message"> = {
    provider: "google",
    providerLabel: "Google",
    totalJpy: null,
    totalOriginal: null,
    originalCurrency: null,
  };

  if (!isGeminiBillingConfigured()) {
    return { ...base, status: "not_configured", message: null };
  }

  try {
    const client = getGa4BigQueryClient();
    const projectId = env.GA4_BIGQUERY_PROJECT_ID;
    const datasetId = env.BILLING_BIGQUERY_DATASET;

    const [tableRows] = await client.query({
      query: buildBillingTableLookupQuery(projectId, datasetId),
      location: env.GA4_BIGQUERY_LOCATION,
    });

    const tableName = (tableRows as Array<{ table_name?: string }>)[0]
      ?.table_name;

    if (!tableName) {
      return {
        ...base,
        status: "error",
        message: "課金エクスポートのテーブルが見つかりません",
      };
    }

    const [costRows] = await client.query({
      query: buildGeminiBillingCostQuery(projectId, datasetId, tableName),
      location: env.GA4_BIGQUERY_LOCATION,
      params: {
        startTimestamp: start.toISOString(),
        endTimestamp: end.toISOString(),
        serviceDescriptions: GEMINI_SERVICE_DESCRIPTIONS,
      },
    });

    return summarizeGeminiBillingRows(costRows as BillingCostRow[], base);
  } catch (error) {
    console.error("Gemini billing fetch error:", error);
    return {
      ...base,
      status: "error",
      message: "Google の実額を取得できませんでした",
    };
  }
}

/**
 * 通貨ごとの行を合計する。JPY 請求はそのまま、USD 請求は固定レートで換算（ADR-003）。
 */
export function summarizeGeminiBillingRows(
  rows: BillingCostRow[],
  base: Omit<AiCostActualEntry, "status" | "message">
): AiCostActualEntry {
  if (rows.length === 0) {
    return {
      ...base,
      status: "ready",
      message: null,
      totalOriginal: 0,
      originalCurrency: null,
      totalJpy: 0,
    };
  }

  let totalJpy = 0;
  let totalOriginal = 0;
  let currency: string | null = null;

  for (const row of rows) {
    const cost = parseBillingCost(row.totalCost);
    const rowCurrency = (row.currency ?? "").toUpperCase();

    totalOriginal += cost;
    currency = currency ?? rowCurrency ?? null;
    totalJpy += rowCurrency === "JPY" ? cost : usdToJpy(cost);
  }

  return {
    ...base,
    status: "ready",
    message: null,
    totalOriginal: Number(totalOriginal.toFixed(4)),
    originalCurrency: currency,
    totalJpy: Math.round(totalJpy * 10) / 10,
  };
}
