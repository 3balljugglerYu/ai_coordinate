import "server-only";

import { LRUCache } from "lru-cache";
import { getRangeBounds, toJstDateKey, type DashboardRange } from "@/features/admin-dashboard/lib/dashboard-range";
import { env } from "@/lib/env";
import { getGa4Client } from "./ga4-client";
import type {
  Ga4DashboardData,
  Ga4TopLandingPageRow,
  Ga4TopPageRow,
} from "./ga4-types";

const PAGE_LIMIT = 8;
const LANDING_PAGE_LIMIT = 8;
const GA4_CACHE_TTL_MS = 5 * 60 * 1000;

// Cache successful dashboard responses briefly to reduce repeated GA4 quota usage.
const ga4DashboardCache = new LRUCache<string, Ga4DashboardData>({
  max: 16,
  ttl: GA4_CACHE_TTL_MS,
});
const ga4DashboardInFlight = new Map<string, Promise<Ga4DashboardData>>();

type Ga4ApiError = {
  code?: number | string;
  details?: string;
  message?: string;
};

function parseMetric(value?: string | null) {
  if (!value) {
    return 0;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizePagePath(value?: string | null) {
  if (!value || value === "(not set)") {
    return "(not set)";
  }

  return value;
}

function normalizePageTitle(value?: string | null) {
  if (!value || value === "(not set)") {
    return null;
  }

  return value;
}

function getTransitionsPendingMessage() {
  if (!env.GA4_BIGQUERY_PROJECT_ID || !env.GA4_BIGQUERY_DATASET) {
    return "ページ遷移は BigQuery dataset 設定後に追加します。";
  }

  return null;
}

function getGa4ErrorMessage(error: unknown) {
  const apiError = error as Ga4ApiError | undefined;
  const code = String(apiError?.code ?? "");
  const details = apiError?.details ?? "";
  const message = apiError?.message ?? "";
  const combinedMessage = `${message} ${details}`.toLowerCase();

  if (
    combinedMessage.includes("has not been used in project") ||
    combinedMessage.includes("is disabled") ||
    combinedMessage.includes("enable it by visiting")
  ) {
    return "Google Analytics Data API が GCP プロジェクトで有効化されていません。analyticsdata.googleapis.com を有効にしてください。";
  }

  if (
    code === "14" ||
    combinedMessage.includes("unavailable") ||
    combinedMessage.includes("name resolution failed")
  ) {
    return "GA4 Data API に接続できませんでした。ローカル環境から analyticsdata.googleapis.com へ通信できるか確認してください。";
  }

  if (
    code === "7" ||
    combinedMessage.includes("permission_denied") ||
    combinedMessage.includes("permission denied")
  ) {
    return "GA4 の Property またはサービスアカウント権限が不足しています。GA4 側のアクセス権を確認してください。";
  }

  if (
    code === "5" ||
    combinedMessage.includes("not found") ||
    combinedMessage.includes("unknown property")
  ) {
    return "GA4 Property ID が見つかりませんでした。Property ID の数値が正しいか確認してください。";
  }

  return "GA4 データの取得に失敗しました。認証情報、Property 権限、または外部通信設定を確認してください。";
}

function getGa4CacheKey(range: DashboardRange) {
  return [
    env.GA4_PROPERTY_ID,
    env.GA4_BIGQUERY_PROJECT_ID,
    env.GA4_BIGQUERY_DATASET,
    range,
  ].join(":");
}

async function buildGa4DashboardData(
  range: DashboardRange
): Promise<Ga4DashboardData> {
  const { currentStart, now } = getRangeBounds(range);
  const dateRanges = [
    {
      startDate: toJstDateKey(currentStart),
      endDate: toJstDateKey(now),
    },
  ];

  try {
    const client = getGa4Client();
    const property = `properties/${env.GA4_PROPERTY_ID}`;

    const [pagesReportResult, landingPagesReportResult] = await Promise.all([
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [
          {
            metric: { metricName: "screenPageViews" },
            desc: true,
          },
        ],
        limit: PAGE_LIMIT,
        keepEmptyRows: false,
        returnPropertyQuota: true,
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "landingPagePlusQueryString" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys: [
          {
            metric: { metricName: "sessions" },
            desc: true,
          },
        ],
        limit: LANDING_PAGE_LIMIT,
        keepEmptyRows: false,
        returnPropertyQuota: true,
      }),
    ]);

    const pagesReport = pagesReportResult[0];
    const landingPagesReport = landingPagesReportResult[0];

    const topPages: Ga4TopPageRow[] =
      pagesReport.rows?.map((row) => ({
        path: normalizePagePath(row.dimensionValues?.[0]?.value),
        title: normalizePageTitle(row.dimensionValues?.[1]?.value),
        views: parseMetric(row.metricValues?.[0]?.value),
        activeUsers: parseMetric(row.metricValues?.[1]?.value),
      })) ?? [];

    const topLandingPages: Ga4TopLandingPageRow[] =
      landingPagesReport.rows?.map((row) => ({
        landingPage: normalizePagePath(row.dimensionValues?.[0]?.value),
        sessions: parseMetric(row.metricValues?.[0]?.value),
        activeUsers: parseMetric(row.metricValues?.[1]?.value),
      })) ?? [];

    return {
      range,
      status: "ready",
      statusMessage: null,
      topPages,
      topLandingPages,
      transitionsPendingMessage: getTransitionsPendingMessage(),
    };
  } catch (error) {
    const apiError = error as Ga4ApiError | undefined;
    console.error("GA4 dashboard fetch error:", {
      code: apiError?.code,
      message: apiError?.message,
      details: apiError?.details,
      raw: error,
    });

    return {
      range,
      status: "error",
      statusMessage: getGa4ErrorMessage(error),
      topPages: [],
      topLandingPages: [],
      transitionsPendingMessage: getTransitionsPendingMessage(),
    };
  }
}

export async function getGa4DashboardData(
  range: DashboardRange
): Promise<Ga4DashboardData> {
  if (
    !env.GA4_PROPERTY_ID ||
    !env.GA4_SERVICE_ACCOUNT_JSON_BASE64 ||
    !env.NEXT_PUBLIC_GA4_MEASUREMENT_ID
  ) {
    return {
      range,
      status: "disabled",
      statusMessage: "GA4 の Property ID または認証情報が未設定です。",
      topPages: [],
      topLandingPages: [],
      transitionsPendingMessage: getTransitionsPendingMessage(),
    };
  }

  const cacheKey = getGa4CacheKey(range);
  const cached = ga4DashboardCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const inFlight = ga4DashboardInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = buildGa4DashboardData(range).then((result) => {
    if (result.status === "ready") {
      ga4DashboardCache.set(cacheKey, result);
    }

    return result;
  });

  ga4DashboardInFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    ga4DashboardInFlight.delete(cacheKey);
  }
}
