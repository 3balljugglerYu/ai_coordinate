import "server-only";

import { LRUCache } from "lru-cache";
import type { BigQuery } from "@google-cloud/bigquery";
import {
  enumerateJstDateKeys,
  getRangeBounds,
  toJstDateKey,
  type DashboardRange,
} from "@/features/admin-dashboard/lib/dashboard-range";
import { env } from "@/lib/env";
import { getGa4BigQueryClient } from "./ga4-bigquery-client";
import type { Ga4DashboardStatus, Ga4EntryAccessRow } from "./ga4-types";

const ENTRY_ACCESS_TOP_LANDING_PAGE_LIMIT = 6;
const ENTRY_ACCESS_OTHER_BUCKET = "__other__";
const GA4_ENTRY_ACCESS_CACHE_TTL_MS = 5 * 60 * 1000;

const ga4EntryAccessCache = new LRUCache<string, Ga4EntryAccessData>({
  max: 16,
  ttl: GA4_ENTRY_ACCESS_CACHE_TTL_MS,
});
const ga4EntryAccessInFlight = new Map<string, Promise<Ga4EntryAccessData>>();

type BigQueryEntryAccessRow = {
  dateKey: string;
  landingPage: string;
  sessions: number | string;
};

export interface Ga4EntryAccessData {
  entryAccessStatus: Ga4DashboardStatus;
  entryAccessStatusMessage: string | null;
  entryAccessRows: Ga4EntryAccessRow[];
  entryAccessDateKeys: string[];
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

function getEntryAccessCacheKey(range: DashboardRange) {
  return [
    env.GA4_BIGQUERY_PROJECT_ID,
    env.GA4_BIGQUERY_DATASET,
    env.GA4_BIGQUERY_LOCATION,
    range,
  ].join(":");
}

function getEntryAccessErrorMessage(error: unknown) {
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

  return "BigQuery から入口ページ別アクセスを取得できませんでした。dataset 名、location、権限を確認してください。";
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

function buildEntryAccessQuery(
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
          CASE
            WHEN REGEXP_CONTAINS(page_path, r'^/posts/[^/]+$') THEN '/posts/[id]'
            WHEN REGEXP_CONTAINS(page_path, r'^/users/[^/]+$') THEN '/users/[userId]'
            ELSE page_path
          END
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
        landing_page
      FROM session_entry_with_host
      WHERE landing_page IS NOT NULL
        AND date_key IS NOT NULL
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
    top_landing_pages AS (
      SELECT landing_page
      FROM filtered_sessions
      GROUP BY landing_page
      ORDER BY COUNT(*) DESC, landing_page ASC
      LIMIT ${ENTRY_ACCESS_TOP_LANDING_PAGE_LIMIT}
    ),
    bucketed_sessions AS (
      SELECT
        date_key,
        CASE
          WHEN landing_page IN (SELECT landing_page FROM top_landing_pages)
          THEN landing_page
          ELSE '${ENTRY_ACCESS_OTHER_BUCKET}'
        END AS landing_page_bucket
      FROM filtered_sessions
    )
    SELECT
      date_key AS dateKey,
      landing_page_bucket AS landingPage,
      COUNT(*) AS sessions
    FROM bucketed_sessions
    GROUP BY dateKey, landingPage
    ORDER BY dateKey ASC, sessions DESC, landingPage ASC
  `;
}

async function buildGa4EntryAccessData(
  range: DashboardRange
): Promise<Ga4EntryAccessData> {
  const bounds = getRangeBounds(range);
  const entryAccessDateKeys = enumerateJstDateKeys(bounds.currentStart, bounds.now);

  if (!hasBigQueryConfig()) {
    return {
      entryAccessStatus: "disabled",
      entryAccessStatusMessage:
        "入口ページ別アクセスを表示するには BigQuery 設定が必要です。",
      entryAccessRows: [],
      entryAccessDateKeys,
    };
  }

  const projectId = env.GA4_BIGQUERY_PROJECT_ID;
  const datasetId = env.GA4_BIGQUERY_DATASET;
  const todayDateSuffix = getDateSuffix(new Date());

  try {
    const client = getGa4BigQueryClient();
    const includeIntraday = await hasIntradayTable(client, datasetId, todayDateSuffix);
    const params = {
      startTimestamp: bounds.currentStartIso,
      endTimestamp: bounds.nowIso,
      startDateSuffix: getDateSuffix(bounds.currentStart),
      endDateSuffix: getDateSuffix(bounds.now),
      todayDateSuffix,
    };

    const [queryResult] = await client.query({
      query: buildEntryAccessQuery(projectId, datasetId, includeIntraday),
      location: env.GA4_BIGQUERY_LOCATION,
      params,
    });

    return {
      entryAccessStatus: "ready",
      entryAccessStatusMessage: null,
      entryAccessRows: ((queryResult ?? []) as BigQueryEntryAccessRow[]).map(
        (row) => ({
          dateKey: row.dateKey,
          landingPage: row.landingPage,
          sessions: parseMetric(row.sessions),
        })
      ),
      entryAccessDateKeys,
    };
  } catch (error) {
    console.error("GA4 entry access fetch error:", {
      message: error instanceof Error ? error.message : String(error),
      raw: error,
    });

    return {
      entryAccessStatus: "error",
      entryAccessStatusMessage: getEntryAccessErrorMessage(error),
      entryAccessRows: [],
      entryAccessDateKeys,
    };
  }
}

export async function getGa4EntryAccessData(
  range: DashboardRange
): Promise<Ga4EntryAccessData> {
  const cacheKey = getEntryAccessCacheKey(range);
  const cached = ga4EntryAccessCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const inFlight = ga4EntryAccessInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = buildGa4EntryAccessData(range).then((result) => {
    if (result.entryAccessStatus !== "error") {
      ga4EntryAccessCache.set(cacheKey, result);
    }
    return result;
  });

  ga4EntryAccessInFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    ga4EntryAccessInFlight.delete(cacheKey);
  }
}
