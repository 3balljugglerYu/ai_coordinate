import "server-only";

import {
  getRangeBounds,
  toJstDateKey,
  type DashboardRange,
} from "@/features/admin-dashboard/lib/dashboard-range";
import { env } from "@/lib/env";
import {
  createGa4RangeCachedFetcher,
  getGa4DateSuffix,
  hasGa4BigQueryConfig,
  hasGa4IntradayTable,
  parseGa4Metric,
} from "./ga4-bigquery-utils";
import { getGa4BigQueryClient } from "./ga4-bigquery-client";
import { buildDauSeriesQuery, buildMauQuery } from "./ga4-dau-mau-query";
import type { Ga4DashboardStatus, Ga4DauRow } from "./ga4-types";

const GA4_DAU_MAU_CACHE_TTL_MS = 5 * 60 * 1000;
/** MAU の集計窓 = 直近30日(range に依存しない固定窓) */
const MAU_WINDOW_DAYS = 30;

type BigQueryDauRow = {
  dateKey: string;
  loggedIn: number | string;
  guest: number | string;
  unknown: number | string;
};

type BigQueryMauRow = {
  mau: number | string;
};

export interface Ga4DauMauData {
  dauMauStatus: Ga4DashboardStatus;
  dauMauStatusMessage: string | null;
  /** 直近 range 窓の日別 distinct 訪問者(DAU 系列・JST 昇順) */
  dauRows: Ga4DauRow[];
  /** 直近30日(当日含む)の distinct 訪問者(MAU・スカラー) */
  mau: number;
}

function getDauMauErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown BigQuery error";
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("not found") ||
    lowerMessage.includes("dataset") ||
    lowerMessage.includes("table")
  ) {
    return "BigQuery dataset またはテーブルが見つかりません。dataset 名を確認してください。";
  }

  if (
    lowerMessage.includes("permission denied") ||
    lowerMessage.includes("access denied")
  ) {
    return "BigQuery の読み取り権限が不足しています。service account の dataset / job 権限を確認してください。";
  }

  if (lowerMessage.includes("location") || lowerMessage.includes("region")) {
    return "BigQuery の location が一致していません。GA4_BIGQUERY_LOCATION を確認してください。";
  }

  return "BigQuery から DAU/MAU を取得できませんでした。dataset 名、location、権限を確認してください。";
}

async function buildGa4DauMauData(
  range: DashboardRange
): Promise<Ga4DauMauData> {
  if (!hasGa4BigQueryConfig()) {
    return {
      dauMauStatus: "disabled",
      dauMauStatusMessage: "DAU/MAU を表示するには BigQuery 設定が必要です。",
      dauRows: [],
      mau: 0,
    };
  }

  const bounds = getRangeBounds(range);
  const projectId = env.GA4_BIGQUERY_PROJECT_ID;
  const datasetId = env.GA4_BIGQUERY_DATASET;
  // MAU = 直近30日(当日含む = 30 JST 日)の distinct 訪問者。
  // 起点を「29日前の JST 0:00」に丸めて最古の JST 日を丸ごと覆う(DAU 系列の暦日と整合)。
  const mauStartKey = toJstDateKey(
    new Date(
      bounds.now.getTime() - (MAU_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000
    )
  );
  const mauStart = new Date(`${mauStartKey}T00:00:00+09:00`);
  const todayDateSuffix = getGa4DateSuffix(bounds.now);

  try {
    const client = getGa4BigQueryClient();
    const includeIntraday = await hasGa4IntradayTable(
      client,
      datasetId,
      todayDateSuffix
    );

    // DAU 系列は dashboard の range 窓、MAU は固定30日窓を使う。
    const dauParams = {
      startTimestamp: bounds.currentStartIso,
      endTimestamp: bounds.nowIso,
      startDateSuffix: getGa4DateSuffix(bounds.currentStart),
      endDateSuffix: getGa4DateSuffix(bounds.now),
      todayDateSuffix,
    };
    const mauParams = {
      startTimestamp: mauStart.toISOString(),
      endTimestamp: bounds.nowIso,
      startDateSuffix: getGa4DateSuffix(mauStart),
      endDateSuffix: getGa4DateSuffix(bounds.now),
      todayDateSuffix,
    };

    const [[dauQueryResult], [mauQueryResult]] = await Promise.all([
      client.query({
        query: buildDauSeriesQuery(projectId, datasetId, includeIntraday),
        location: env.GA4_BIGQUERY_LOCATION,
        params: dauParams,
      }),
      client.query({
        query: buildMauQuery(projectId, datasetId, includeIntraday),
        location: env.GA4_BIGQUERY_LOCATION,
        params: mauParams,
      }),
    ]);

    const dauRows = ((dauQueryResult ?? []) as BigQueryDauRow[]).map((row) => ({
      dateKey: row.dateKey,
      loggedIn: parseGa4Metric(row.loggedIn),
      guest: parseGa4Metric(row.guest),
      unknown: parseGa4Metric(row.unknown),
    }));
    const mau = parseGa4Metric(
      ((mauQueryResult ?? []) as BigQueryMauRow[])[0]?.mau
    );

    return {
      dauMauStatus: "ready",
      dauMauStatusMessage: null,
      dauRows,
      mau,
    };
  } catch (error) {
    console.error("GA4 DAU/MAU fetch error:", {
      message: error instanceof Error ? error.message : String(error),
      raw: error,
    });

    return {
      dauMauStatus: "error",
      dauMauStatusMessage: getDauMauErrorMessage(error),
      dauRows: [],
      mau: 0,
    };
  }
}

export const getGa4DauMauData = createGa4RangeCachedFetcher({
  ttlMs: GA4_DAU_MAU_CACHE_TTL_MS,
  buildData: buildGa4DauMauData,
  isCacheable: (result) => result.dauMauStatus !== "error",
});
