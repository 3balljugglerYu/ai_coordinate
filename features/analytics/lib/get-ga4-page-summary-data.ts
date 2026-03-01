import "server-only";

import { LRUCache } from "lru-cache";
import { getRangeBounds, toJstDateKey, type DashboardRange } from "@/features/admin-dashboard/lib/dashboard-range";
import { env } from "@/lib/env";
import { getGa4BigQueryClient } from "./ga4-bigquery-client";
import { getGa4Client } from "./ga4-client";
import type {
  Ga4DashboardStatus,
  Ga4TopLandingPageRow,
  Ga4TopPageRow,
} from "./ga4-types";

const PAGE_LIMIT = 8;
const LANDING_PAGE_LIMIT = 8;
const GA4_PAGE_SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;

const ga4PageSummaryCache = new LRUCache<string, Ga4PageSummaryData>({
  max: 16,
  ttl: GA4_PAGE_SUMMARY_CACHE_TTL_MS,
});
const ga4PageSummaryInFlight = new Map<string, Promise<Ga4PageSummaryData>>();

type Ga4ApiError = {
  code?: number | string;
  details?: string;
  message?: string;
};

type BigQueryTopPageRow = {
  path: string;
  title: string | null;
  views: number | string;
  activeUsers: number | string;
};

type BigQueryTopLandingPageRow = {
  landingPage: string;
  sessions: number | string;
  activeUsers: number | string;
};

export interface Ga4PageSummaryData {
  status: Ga4DashboardStatus;
  statusMessage: string | null;
  topPages: Ga4TopPageRow[];
  topLandingPages: Ga4TopLandingPageRow[];
}

function parseMetric(value?: string | null) {
  if (!value) {
    return 0;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function parseBigQueryMetric(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  return 0;
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

function getBigQuerySummaryErrorMessage(error: unknown) {
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

  if (
    lowerMessage.includes("location") ||
    lowerMessage.includes("region")
  ) {
    return "BigQuery の location が一致していません。GA4_BIGQUERY_LOCATION を確認してください。";
  }

  return "BigQuery からページ分析を取得できませんでした。dataset 名、location、権限を確認してください。";
}

function getSummaryCacheKey(range: DashboardRange) {
  return [
    env.GA4_PROPERTY_ID,
    env.GA4_BIGQUERY_PROJECT_ID,
    env.GA4_BIGQUERY_DATASET,
    env.GA4_BIGQUERY_LOCATION,
    range,
  ].join(":");
}

function getDateSuffix(value: Date) {
  return toJstDateKey(value).replaceAll("-", "");
}

function requiresRollingBigQuery(range: DashboardRange) {
  return range === "24h";
}

function hasBigQueryConfig() {
  return Boolean(
    env.GA4_BIGQUERY_PROJECT_ID &&
      env.GA4_BIGQUERY_DATASET &&
      env.GA4_BIGQUERY_LOCATION
  );
}

async function hasIntradayTable(datasetId: string, suffix: string) {
  const client = getGa4BigQueryClient();
  const [exists] = await client
    .dataset(datasetId)
    .table(`events_intraday_${suffix}`)
    .exists();

  return exists;
}

function buildRawPageviewSelect(
  tablePattern: string,
  suffixPredicate: string
) {
  return `
    SELECT
      user_pseudo_id,
      CONCAT(
        user_pseudo_id,
        '.',
        CAST(
          (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING
        )
      ) AS session_key,
      event_timestamp,
      batch_page_id,
      batch_ordering_id,
      batch_event_index,
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS page_title
    FROM ${tablePattern}
    WHERE event_name = 'page_view'
      AND ${suffixPredicate}
      AND TIMESTAMP_MICROS(event_timestamp) BETWEEN TIMESTAMP(@startTimestamp) AND TIMESTAMP(@endTimestamp)
      AND (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') IS NOT NULL
  `;
}

function buildNormalizedPageviewsCte(
  projectId: string,
  datasetId: string,
  includeIntraday: boolean
) {
  const dailySelect = buildRawPageviewSelect(
    `\`${projectId}.${datasetId}.events_*\``,
    "_TABLE_SUFFIX BETWEEN @startDateSuffix AND @endDateSuffix AND _TABLE_SUFFIX NOT LIKE 'intraday_%'"
  );

  const rawPageviewQuery = includeIntraday
    ? `${dailySelect}
       UNION ALL
       ${buildRawPageviewSelect(
         `\`${projectId}.${datasetId}.events_intraday_*\``,
         "_TABLE_SUFFIX = @todayDateSuffix"
       )}`
    : dailySelect;

  return `
    WITH raw_pageviews AS (
      ${rawPageviewQuery}
    ),
    normalized_pageviews AS (
      SELECT
        user_pseudo_id,
        session_key,
        event_timestamp,
        batch_page_id,
        batch_ordering_id,
        batch_event_index,
        CASE
          WHEN normalized_path IS NULL OR normalized_path = '' THEN '/'
          WHEN normalized_path != '/' THEN REGEXP_REPLACE(normalized_path, r'/$', '')
          ELSE normalized_path
        END AS page_path,
        CASE
          WHEN page_title IS NULL OR page_title = '' OR page_title = '(not set)' THEN NULL
          ELSE page_title
        END AS page_title
      FROM (
        SELECT
          user_pseudo_id,
          session_key,
          event_timestamp,
          batch_page_id,
          batch_ordering_id,
          batch_event_index,
          COALESCE(
            REGEXP_EXTRACT(page_location, r'^https?://[^/]+(/[^?#]*)'),
            REGEXP_EXTRACT(page_location, r'^(/[^?#]*)'),
            '/'
          ) AS normalized_path,
          page_title
        FROM raw_pageviews
      )
    )
  `;
}

function buildTopPagesQuery(
  projectId: string,
  datasetId: string,
  includeIntraday: boolean
) {
  return `
    ${buildNormalizedPageviewsCte(projectId, datasetId, includeIntraday)}
    SELECT
      page_path AS path,
      ARRAY_AGG(page_title IGNORE NULLS ORDER BY event_timestamp DESC LIMIT 1)[SAFE_OFFSET(0)] AS title,
      COUNT(*) AS views,
      COUNT(DISTINCT user_pseudo_id) AS activeUsers
    FROM normalized_pageviews
    GROUP BY path
    ORDER BY views DESC, activeUsers DESC, path ASC
    LIMIT ${PAGE_LIMIT}
  `;
}

function buildTopLandingPagesQuery(
  projectId: string,
  datasetId: string,
  includeIntraday: boolean
) {
  return `
    ${buildNormalizedPageviewsCte(projectId, datasetId, includeIntraday)}
    , session_landing_pages AS (
      SELECT
        session_key,
        user_pseudo_id,
        page_path AS landingPage,
        ROW_NUMBER() OVER (
          PARTITION BY session_key
          ORDER BY event_timestamp, batch_page_id, batch_ordering_id, batch_event_index
        ) AS rowNumber
      FROM normalized_pageviews
    )
    SELECT
      landingPage,
      COUNT(*) AS sessions,
      COUNT(DISTINCT user_pseudo_id) AS activeUsers
    FROM session_landing_pages
    WHERE rowNumber = 1
    GROUP BY landingPage
    ORDER BY sessions DESC, activeUsers DESC, landingPage ASC
    LIMIT ${LANDING_PAGE_LIMIT}
  `;
}

async function buildBigQueryPageSummary(
  range: DashboardRange
): Promise<Ga4PageSummaryData> {
  if (!hasBigQueryConfig()) {
    return {
      status: "disabled",
      statusMessage: "24h の厳密な rolling 集計には BigQuery 設定が必要です。",
      topPages: [],
      topLandingPages: [],
    };
  }

  const bounds = getRangeBounds(range);
  const projectId = env.GA4_BIGQUERY_PROJECT_ID;
  const datasetId = env.GA4_BIGQUERY_DATASET;
  const todayDateSuffix = getDateSuffix(new Date());

  try {
    const client = getGa4BigQueryClient();
    const includeIntraday = await hasIntradayTable(datasetId, todayDateSuffix);
    const params = {
      startTimestamp: bounds.currentStartIso,
      endTimestamp: bounds.nowIso,
      startDateSuffix: getDateSuffix(bounds.currentStart),
      endDateSuffix: getDateSuffix(bounds.now),
      todayDateSuffix,
    };

    const [topPagesResult, topLandingPagesResult] = await Promise.all([
      client.query({
        query: buildTopPagesQuery(projectId, datasetId, includeIntraday),
        location: env.GA4_BIGQUERY_LOCATION,
        params,
      }),
      client.query({
        query: buildTopLandingPagesQuery(projectId, datasetId, includeIntraday),
        location: env.GA4_BIGQUERY_LOCATION,
        params,
      }),
    ]);

    const topPagesRows = (topPagesResult[0] ?? []) as BigQueryTopPageRow[];
    const topLandingRows =
      (topLandingPagesResult[0] ?? []) as BigQueryTopLandingPageRow[];

    return {
      status: "ready",
      statusMessage: null,
      topPages: topPagesRows.map((row) => ({
        path: normalizePagePath(row.path),
        title: normalizePageTitle(row.title),
        views: parseBigQueryMetric(row.views),
        activeUsers: parseBigQueryMetric(row.activeUsers),
      })),
      topLandingPages: topLandingRows.map((row) => ({
        landingPage: normalizePagePath(row.landingPage),
        sessions: parseBigQueryMetric(row.sessions),
        activeUsers: parseBigQueryMetric(row.activeUsers),
      })),
    };
  } catch (error) {
    console.error("GA4 BigQuery page summary fetch error:", {
      message: error instanceof Error ? error.message : String(error),
      raw: error,
    });

    return {
      status: "error",
      statusMessage: getBigQuerySummaryErrorMessage(error),
      topPages: [],
      topLandingPages: [],
    };
  }
}

async function buildDataApiPageSummary(
  range: DashboardRange
): Promise<Ga4PageSummaryData> {
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

    return {
      status: "ready",
      statusMessage: null,
      topPages:
        pagesReport.rows?.map((row) => ({
          path: normalizePagePath(row.dimensionValues?.[0]?.value),
          title: normalizePageTitle(row.dimensionValues?.[1]?.value),
          views: parseMetric(row.metricValues?.[0]?.value),
          activeUsers: parseMetric(row.metricValues?.[1]?.value),
        })) ?? [],
      topLandingPages:
        landingPagesReport.rows?.map((row) => ({
          landingPage: normalizePagePath(row.dimensionValues?.[0]?.value),
          sessions: parseMetric(row.metricValues?.[0]?.value),
          activeUsers: parseMetric(row.metricValues?.[1]?.value),
        })) ?? [],
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
      status: "error",
      statusMessage: getGa4ErrorMessage(error),
      topPages: [],
      topLandingPages: [],
    };
  }
}

async function buildGa4PageSummaryData(
  range: DashboardRange
): Promise<Ga4PageSummaryData> {
  if (!env.GA4_PROPERTY_ID || !env.GA4_SERVICE_ACCOUNT_JSON_BASE64) {
    return {
      status: "disabled",
      statusMessage: "GA4 の Property ID または認証情報が未設定です。",
      topPages: [],
      topLandingPages: [],
    };
  }

  if (requiresRollingBigQuery(range)) {
    return buildBigQueryPageSummary(range);
  }

  return buildDataApiPageSummary(range);
}

export async function getGa4PageSummaryData(
  range: DashboardRange
): Promise<Ga4PageSummaryData> {
  const cacheKey = getSummaryCacheKey(range);
  const cached = ga4PageSummaryCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const inFlight = ga4PageSummaryInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = buildGa4PageSummaryData(range).then((result) => {
    if (result.status !== "error") {
      ga4PageSummaryCache.set(cacheKey, result);
    }

    return result;
  });

  ga4PageSummaryInFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    ga4PageSummaryInFlight.delete(cacheKey);
  }
}
