import "server-only";

import type { BigQuery } from "@google-cloud/bigquery";
import { getRangeBounds, toJstDateKey, type DashboardRange } from "@/features/admin-dashboard/lib/dashboard-range";
import { env } from "@/lib/env";
import { getGa4BigQueryClient } from "./ga4-bigquery-client";
import type {
  Ga4DashboardStatus,
  Ga4DropoffPageRow,
  Ga4TopTransitionRow,
} from "./ga4-types";

const TRACKED_PAGE_PATHS = [
  "/",
  "/pricing",
  "/login",
  "/signup",
  "/coordinate",
  "/my-page",
  "/my-page/credits",
  "/my-page/credits/purchase",
] as const;

const DEFAULT_DISABLED_MESSAGE =
  "ページ遷移と導線離脱は BigQuery 設定後に追加します。";

type BigQueryTransitionRow = {
  fromPage: string;
  toPage: string;
  transitionCount: number | string;
};

type BigQueryDropoffRow = {
  page: string;
  reachedSessions: number | string;
  continuedSessions: number | string;
  dropoffSessions: number | string;
  dropoffRate: number | string;
};

export interface Ga4PageFlowData {
  pageFlowStatus: Ga4DashboardStatus;
  pageFlowStatusMessage: string | null;
  topTransitions: Ga4TopTransitionRow[];
  topDropoffPages: Ga4DropoffPageRow[];
}

function getPageFlowDisabledMessage() {
  if (
    !env.GA4_BIGQUERY_PROJECT_ID ||
    !env.GA4_BIGQUERY_DATASET ||
    !env.GA4_BIGQUERY_LOCATION
  ) {
    return DEFAULT_DISABLED_MESSAGE;
  }

  return null;
}

function getDateSuffix(value: Date) {
  return toJstDateKey(value).replaceAll("-", "");
}

function parseNumeric(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  return 0;
}

function getPageFlowErrorMessage(error: unknown) {
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

  return "BigQuery からページ遷移と導線離脱を取得できませんでした。dataset 名、location、権限を確認してください。";
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
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location
    FROM ${tablePattern}
    WHERE event_name = 'page_view'
      AND ${suffixPredicate}
      AND TIMESTAMP_MICROS(event_timestamp) BETWEEN TIMESTAMP(@startTimestamp) AND TIMESTAMP(@endTimestamp)
      AND (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') IS NOT NULL
  `;
}

function buildBasePageviewsCtes(
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
          WHEN REGEXP_CONTAINS(trimmed_path, r'^/posts/[^/]+$') THEN '/posts/[id]'
          WHEN REGEXP_CONTAINS(trimmed_path, r'^/users/[^/]+$') THEN '/users/[userId]'
          ELSE trimmed_path
        END AS page_path
      FROM (
        SELECT
          session_key,
          event_timestamp,
          batch_page_id,
          batch_ordering_id,
          batch_event_index,
          CASE
            WHEN extracted_path IS NULL OR extracted_path = '' THEN '/'
            WHEN extracted_path != '/' THEN REGEXP_REPLACE(extracted_path, r'/$', '')
            ELSE extracted_path
          END AS trimmed_path
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
            ) AS extracted_path
          FROM raw_pageviews
        )
      )
    ),
    ordered_pageviews AS (
      SELECT
        session_key,
        page_path,
        LEAD(page_path) OVER (
          PARTITION BY session_key
          ORDER BY event_timestamp, batch_page_id, batch_ordering_id, batch_event_index
        ) AS next_page
      FROM normalized_pageviews
    )
  `;
}

function buildTransitionsQuery(
  projectId: string,
  datasetId: string,
  includeIntraday: boolean
) {
  return `
    ${buildBasePageviewsCtes(projectId, datasetId, includeIntraday)}
    SELECT
      page_path AS fromPage,
      next_page AS toPage,
      COUNT(*) AS transitionCount
    FROM ordered_pageviews
    WHERE page_path IN UNNEST(@trackedPages)
      AND next_page IN UNNEST(@trackedPages)
      AND next_page IS NOT NULL
      AND next_page != page_path
    GROUP BY fromPage, toPage
    ORDER BY transitionCount DESC, fromPage ASC, toPage ASC
    LIMIT 10
  `;
}

function buildDropoffQuery(
  projectId: string,
  datasetId: string,
  includeIntraday: boolean
) {
  return `
    ${buildBasePageviewsCtes(projectId, datasetId, includeIntraday)}
    , tracked_page_sessions AS (
      SELECT
        session_key,
        page_path,
        LOGICAL_OR(
          next_page IS NOT NULL
          AND next_page IN UNNEST(@trackedPages)
          AND next_page != page_path
        ) AS hasNextTrackedPage
      FROM ordered_pageviews
      WHERE page_path IN UNNEST(@trackedPages)
      GROUP BY session_key, page_path
    )
    SELECT
      page_path AS page,
      COUNT(*) AS reachedSessions,
      COUNTIF(hasNextTrackedPage) AS continuedSessions,
      COUNT(*) - COUNTIF(hasNextTrackedPage) AS dropoffSessions,
      SAFE_DIVIDE(
        COUNT(*) - COUNTIF(hasNextTrackedPage),
        COUNT(*)
      ) AS dropoffRate
    FROM tracked_page_sessions
    GROUP BY page
    ORDER BY dropoffSessions DESC, dropoffRate DESC, page ASC
    LIMIT 10
  `;
}

export async function getGa4PageFlowData(
  range: DashboardRange
): Promise<Ga4PageFlowData> {
  const disabledMessage = getPageFlowDisabledMessage();

  if (disabledMessage) {
    return {
      pageFlowStatus: "disabled",
      pageFlowStatusMessage: disabledMessage,
      topTransitions: [],
      topDropoffPages: [],
    };
  }

  const projectId = env.GA4_BIGQUERY_PROJECT_ID;
  const datasetId = env.GA4_BIGQUERY_DATASET;

  const bounds = getRangeBounds(range);
  const startDateSuffix = getDateSuffix(bounds.currentStart);
  const endDateSuffix = getDateSuffix(bounds.now);
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
      startDateSuffix,
      endDateSuffix,
      todayDateSuffix,
      trackedPages: [...TRACKED_PAGE_PATHS],
    };

    const [transitionRowsResult, dropoffRowsResult] = await Promise.all([
      client.query({
        query: buildTransitionsQuery(projectId, datasetId, includeIntraday),
        location: env.GA4_BIGQUERY_LOCATION,
        params,
      }),
      client.query({
        query: buildDropoffQuery(projectId, datasetId, includeIntraday),
        location: env.GA4_BIGQUERY_LOCATION,
        params,
      }),
    ]);

    const transitionRows = (transitionRowsResult[0] ?? []) as BigQueryTransitionRow[];
    const dropoffRows = (dropoffRowsResult[0] ?? []) as BigQueryDropoffRow[];

    const totalTransitionCount = transitionRows.reduce(
      (sum, row) => sum + parseNumeric(row.transitionCount),
      0
    );

    return {
      pageFlowStatus: "ready",
      pageFlowStatusMessage: null,
      topTransitions: transitionRows.map((row) => {
        const transitionCount = parseNumeric(row.transitionCount);

        return {
          fromPage: row.fromPage,
          toPage: row.toPage,
          transitionCount,
          sharePct:
            totalTransitionCount > 0
              ? transitionCount / totalTransitionCount
              : 0,
        };
      }),
      topDropoffPages: dropoffRows.map((row) => ({
        page: row.page,
        reachedSessions: parseNumeric(row.reachedSessions),
        continuedSessions: parseNumeric(row.continuedSessions),
        dropoffSessions: parseNumeric(row.dropoffSessions),
        dropoffRate: parseNumeric(row.dropoffRate),
      })),
    };
  } catch (error) {
    console.error("GA4 page flow fetch error:", {
      message: error instanceof Error ? error.message : String(error),
      raw: error,
    });

    return {
      pageFlowStatus: "error",
      pageFlowStatusMessage: getPageFlowErrorMessage(error),
      topTransitions: [],
      topDropoffPages: [],
    };
  }
}
