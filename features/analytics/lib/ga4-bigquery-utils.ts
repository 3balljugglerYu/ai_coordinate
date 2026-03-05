import "server-only";

import { LRUCache } from "lru-cache";
import type { BigQuery } from "@google-cloud/bigquery";
import {
  toJstDateKey,
  type DashboardRange,
} from "@/features/admin-dashboard/lib/dashboard-range";
import { env } from "@/lib/env";

interface CreateGa4RangeCachedFetcherOptions<TResult extends object> {
  ttlMs: number;
  maxEntries?: number;
  buildData: (range: DashboardRange) => Promise<TResult>;
  isCacheable?: (result: TResult) => boolean;
}

export function getGa4DateSuffix(value: Date) {
  return toJstDateKey(value).replaceAll("-", "");
}

export function parseGa4Metric(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  return 0;
}

export function hasGa4BigQueryConfig() {
  return Boolean(
    env.GA4_BIGQUERY_PROJECT_ID &&
      env.GA4_BIGQUERY_DATASET &&
      env.GA4_BIGQUERY_LOCATION &&
      env.GA4_SERVICE_ACCOUNT_JSON_BASE64
  );
}

export function buildGa4RangeCacheKey(range: DashboardRange) {
  return [
    env.GA4_BIGQUERY_PROJECT_ID,
    env.GA4_BIGQUERY_DATASET,
    env.GA4_BIGQUERY_LOCATION,
    range,
  ].join(":");
}

export async function hasGa4IntradayTable(
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

export function buildGa4RawPageviewSelect(
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

export function createGa4RangeCachedFetcher<TResult extends object>({
  ttlMs,
  maxEntries = 16,
  buildData,
  isCacheable = () => true,
}: CreateGa4RangeCachedFetcherOptions<TResult>) {
  const cache = new LRUCache<string, TResult>({
    max: maxEntries,
    ttl: ttlMs,
  });
  const inFlight = new Map<string, Promise<TResult>>();

  return async function fetch(range: DashboardRange): Promise<TResult> {
    const cacheKey = buildGa4RangeCacheKey(range);
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const existingRequest = inFlight.get(cacheKey);
    if (existingRequest) {
      return existingRequest;
    }

    const request = buildData(range).then((result) => {
      if (isCacheable(result)) {
        cache.set(cacheKey, result);
      }
      return result;
    });

    inFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      inFlight.delete(cacheKey);
    }
  };
}
