import "server-only";

import { LRUCache } from "lru-cache";
import type { BigQuery } from "@google-cloud/bigquery";
import {
  getRangeBounds,
  toJstDateKey,
  type DashboardRange,
} from "@/features/admin-dashboard/lib/dashboard-range";
import { env } from "@/lib/env";
import { getGa4BigQueryClient } from "./ga4-bigquery-client";
import type { Ga4DashboardStatus, Ga4ExternalAccessRow } from "./ga4-types";

const GA4_EXTERNAL_ACCESS_CACHE_TTL_MS = 5 * 60 * 1000;

const ga4ExternalAccessCache = new LRUCache<string, Ga4ExternalAccessData>({
  max: 16,
  ttl: GA4_EXTERNAL_ACCESS_CACHE_TTL_MS,
});
const ga4ExternalAccessInFlight = new Map<
  string,
  Promise<Ga4ExternalAccessData>
>();

type BigQueryExternalAccessRow = {
  dateKey: string;
  xSessions: number | string;
  campfireSessions: number | string;
  searchSessions: number | string;
  otherExternalSessions: number | string;
  totalExternalSessions: number | string;
};

export interface Ga4ExternalAccessData {
  externalAccessStatus: Ga4DashboardStatus;
  externalAccessStatusMessage: string | null;
  externalAccessRows: Ga4ExternalAccessRow[];
}

function getDateSuffix(value: Date) {
  return toJstDateKey(value).replaceAll("-", "");
}

function parseMetric(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  return 0;
}

function hasBigQueryConfig() {
  return Boolean(
    env.GA4_BIGQUERY_PROJECT_ID &&
      env.GA4_BIGQUERY_DATASET &&
      env.GA4_BIGQUERY_LOCATION &&
      env.GA4_SERVICE_ACCOUNT_JSON_BASE64
  );
}

function getExternalAccessCacheKey(range: DashboardRange) {
  return [
    env.GA4_BIGQUERY_PROJECT_ID,
    env.GA4_BIGQUERY_DATASET,
    env.GA4_BIGQUERY_LOCATION,
    range,
  ].join(":");
}

function getExternalAccessErrorMessage(error: unknown) {
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

  return "BigQuery から外部流入アクセスを取得できませんでした。dataset 名、location、権限を確認してください。";
}

async function hasIntradayTable(
  client: BigQuery,
  datasetId: string,
  suffix: string
) {
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
      LOWER(COALESCE((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer'), '')) AS page_referrer
    FROM ${tablePattern}
    WHERE event_name = 'page_view'
      AND ${suffixPredicate}
      AND TIMESTAMP_MICROS(event_timestamp) BETWEEN TIMESTAMP(@startTimestamp) AND TIMESTAMP(@endTimestamp)
      AND (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') IS NOT NULL
  `;
}

function buildExternalAccessQuery(
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
        normalized_host AS page_host,
        page_referrer
      FROM (
        SELECT
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
          COALESCE(
            LOWER(REGEXP_EXTRACT(page_location, r'^(?:https?://)?([^/:?#]+)')),
            ''
          ) AS normalized_host,
          page_referrer
        FROM raw_pageviews
      )
    ),
    session_entry AS (
      SELECT
        session_key,
        ARRAY_AGG(
          DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Tokyo')
          ORDER BY event_timestamp, batch_page_id, batch_ordering_id, batch_event_index
          LIMIT 1
        )[SAFE_OFFSET(0)] AS entry_date_jst,
        ARRAY_AGG(
          page_path
          ORDER BY event_timestamp, batch_page_id, batch_ordering_id, batch_event_index
          LIMIT 1
        )[SAFE_OFFSET(0)] AS landing_page,
        ARRAY_AGG(
          NULLIF(page_host, '')
          IGNORE NULLS
          ORDER BY event_timestamp, batch_page_id, batch_ordering_id, batch_event_index
          LIMIT 1
        )[SAFE_OFFSET(0)] AS landing_host,
        ARRAY_AGG(
          NULLIF(page_referrer, '')
          IGNORE NULLS
          ORDER BY event_timestamp, batch_page_id, batch_ordering_id, batch_event_index
          LIMIT 1
        )[SAFE_OFFSET(0)] AS first_referrer
      FROM normalized_pageviews
      GROUP BY session_key
    ),
    session_entry_with_host AS (
      SELECT
        FORMAT_DATE('%Y-%m-%d', entry_date_jst) AS date_key,
        landing_page,
        landing_host,
        first_referrer,
        COALESCE(
          LOWER(REGEXP_EXTRACT(first_referrer, r'^(?:https?://)?([^/:?#]+)')),
          ''
        ) AS referrer_host
      FROM session_entry
    ),
    filtered_sessions AS (
      SELECT
        date_key,
        first_referrer,
        referrer_host
      FROM session_entry_with_host
      WHERE date_key IS NOT NULL
        AND landing_page IS NOT NULL
        AND NOT REGEXP_CONTAINS(landing_page, r'^/admin(?:/|$)')
        AND NOT (
          landing_host = 'localhost'
          OR landing_host = '127.0.0.1'
          OR REGEXP_CONTAINS(landing_host, r'(^|\\.)localhost$')
          OR referrer_host = 'localhost'
          OR referrer_host = '127.0.0.1'
          OR REGEXP_CONTAINS(referrer_host, r'(^|\\.)localhost$')
        )
    ),
    classified_sessions AS (
      SELECT
        date_key,
        CASE
          WHEN first_referrer IS NULL THEN 'non_external'
          WHEN REGEXP_CONTAINS(referrer_host, r'(^|\\.)(x\\.com|twitter\\.com|t\\.co)$') THEN 'x'
          WHEN REGEXP_CONTAINS(referrer_host, r'(^|\\.)camp-fire\\.jp$') THEN 'campfire'
          WHEN REGEXP_CONTAINS(referrer_host, r'(^|\\.)(google\\.[a-z.]+|bing\\.com|yahoo\\.co\\.jp|yahoo\\.com|duckduckgo\\.com)$') THEN 'search'
          WHEN REGEXP_CONTAINS(referrer_host, r'(^|\\.)persta\\.ai$') THEN 'non_external'
          ELSE 'other_external'
        END AS source
      FROM filtered_sessions
    ),
    aggregated_external AS (
      SELECT
        date_key,
        COUNTIF(source = 'x') AS x_sessions,
        COUNTIF(source = 'campfire') AS campfire_sessions,
        COUNTIF(source = 'search') AS search_sessions,
        COUNTIF(source = 'other_external') AS other_external_sessions
      FROM classified_sessions
      GROUP BY date_key
    ),
    date_series AS (
      SELECT
        FORMAT_DATE('%Y-%m-%d', date_item) AS date_key
      FROM UNNEST(
        GENERATE_DATE_ARRAY(
          DATE(TIMESTAMP(@startTimestamp), 'Asia/Tokyo'),
          DATE(TIMESTAMP(@endTimestamp), 'Asia/Tokyo')
        )
      ) AS date_item
    )
    SELECT
      date_series.date_key AS dateKey,
      COALESCE(aggregated_external.x_sessions, 0) AS xSessions,
      COALESCE(aggregated_external.campfire_sessions, 0) AS campfireSessions,
      COALESCE(aggregated_external.search_sessions, 0) AS searchSessions,
      COALESCE(aggregated_external.other_external_sessions, 0) AS otherExternalSessions,
      COALESCE(aggregated_external.x_sessions, 0)
        + COALESCE(aggregated_external.campfire_sessions, 0)
        + COALESCE(aggregated_external.search_sessions, 0)
        + COALESCE(aggregated_external.other_external_sessions, 0) AS totalExternalSessions
    FROM date_series
    LEFT JOIN aggregated_external
      ON date_series.date_key = aggregated_external.date_key
    ORDER BY dateKey ASC
  `;
}

async function buildGa4ExternalAccessData(
  range: DashboardRange
): Promise<Ga4ExternalAccessData> {
  if (!hasBigQueryConfig()) {
    return {
      externalAccessStatus: "disabled",
      externalAccessStatusMessage:
        "外部流入アクセスを表示するには BigQuery 設定が必要です。",
      externalAccessRows: [],
    };
  }

  const bounds = getRangeBounds(range);
  const projectId = env.GA4_BIGQUERY_PROJECT_ID;
  const datasetId = env.GA4_BIGQUERY_DATASET;
  const todayDateSuffix = getDateSuffix(new Date());

  try {
    const client = getGa4BigQueryClient();
    const includeIntraday = await hasIntradayTable(
      client,
      datasetId,
      todayDateSuffix
    );

    const params = {
      startTimestamp: bounds.currentStartIso,
      endTimestamp: bounds.nowIso,
      startDateSuffix: getDateSuffix(bounds.currentStart),
      endDateSuffix: getDateSuffix(bounds.now),
      todayDateSuffix,
    };

    const [queryResult] = await client.query({
      query: buildExternalAccessQuery(projectId, datasetId, includeIntraday),
      location: env.GA4_BIGQUERY_LOCATION,
      params,
    });

    return {
      externalAccessStatus: "ready",
      externalAccessStatusMessage: null,
      externalAccessRows: ((queryResult ?? []) as BigQueryExternalAccessRow[]).map(
        (row) => ({
          dateKey: row.dateKey,
          xSessions: parseMetric(row.xSessions),
          campfireSessions: parseMetric(row.campfireSessions),
          searchSessions: parseMetric(row.searchSessions),
          otherExternalSessions: parseMetric(row.otherExternalSessions),
          totalExternalSessions: parseMetric(row.totalExternalSessions),
        })
      ),
    };
  } catch (error) {
    console.error("GA4 external access fetch error:", {
      message: error instanceof Error ? error.message : String(error),
      raw: error,
    });

    return {
      externalAccessStatus: "error",
      externalAccessStatusMessage: getExternalAccessErrorMessage(error),
      externalAccessRows: [],
    };
  }
}

export async function getGa4ExternalAccessData(
  range: DashboardRange
): Promise<Ga4ExternalAccessData> {
  const cacheKey = getExternalAccessCacheKey(range);
  const cached = ga4ExternalAccessCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const inFlight = ga4ExternalAccessInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = buildGa4ExternalAccessData(range).then((result) => {
    if (result.externalAccessStatus !== "error") {
      ga4ExternalAccessCache.set(cacheKey, result);
    }
    return result;
  });

  ga4ExternalAccessInFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    ga4ExternalAccessInFlight.delete(cacheKey);
  }
}
