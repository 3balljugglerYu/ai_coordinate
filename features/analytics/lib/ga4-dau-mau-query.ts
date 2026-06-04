/**
 * GA4 BigQuery の DAU/MAU 集計クエリビルダー(純粋・I/O なし)。
 * "アクセス" = page_view イベントを持つ訪問者。DAU/MAU は COUNT(DISTINCT user_pseudo_id)
 * （COUNT DISTINCT は NULL を無視するため明示的な NULL ガードは不要）。
 */

/** events テーブルから訪問者(user_pseudo_id)を投影する生 SELECT */
export function buildDauRawSelect(
  tablePattern: string,
  suffixPredicate: string
): string {
  return `
    SELECT
      user_pseudo_id,
      event_timestamp
    FROM ${tablePattern}
    WHERE event_name = 'page_view'
      AND ${suffixPredicate}
      AND TIMESTAMP_MICROS(event_timestamp) BETWEEN TIMESTAMP(@startTimestamp) AND TIMESTAMP(@endTimestamp)
  `;
}

/** events_*(日次) + 必要なら events_intraday_*(当日) を UNION ALL した raw_users CTE 本体 */
function buildRawUsersSource(
  projectId: string,
  datasetId: string,
  includeIntraday: boolean
): string {
  const daily = buildDauRawSelect(
    `\`${projectId}.${datasetId}.events_*\``,
    "_TABLE_SUFFIX BETWEEN @startDateSuffix AND @endDateSuffix AND _TABLE_SUFFIX NOT LIKE 'intraday_%'"
  );

  if (!includeIntraday) {
    return daily;
  }

  return `${daily}
       UNION ALL
       ${buildDauRawSelect(
         `\`${projectId}.${datasetId}.events_intraday_*\``,
         "_TABLE_SUFFIX = @todayDateSuffix"
       )}`;
}

/** DAU 日次系列(JST・GENERATE_DATE_ARRAY でゼロ埋め・昇順) */
export function buildDauSeriesQuery(
  projectId: string,
  datasetId: string,
  includeIntraday: boolean
): string {
  const rawUsers = buildRawUsersSource(projectId, datasetId, includeIntraday);

  return `
    WITH raw_users AS (
      ${rawUsers}
    ),
    aggregated AS (
      SELECT
        FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Tokyo')) AS date_key,
        COUNT(DISTINCT user_pseudo_id) AS dau
      FROM raw_users
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
      COALESCE(aggregated.dau, 0) AS dau
    FROM date_series
    LEFT JOIN aggregated
      ON date_series.date_key = aggregated.date_key
    ORDER BY dateKey ASC
  `;
}

/** MAU スカラー(窓全体の distinct 訪問者) */
export function buildMauQuery(
  projectId: string,
  datasetId: string,
  includeIntraday: boolean
): string {
  const rawUsers = buildRawUsersSource(projectId, datasetId, includeIntraday);

  return `
    WITH raw_users AS (
      ${rawUsers}
    )
    SELECT COUNT(DISTINCT user_pseudo_id) AS mau
    FROM raw_users
  `;
}
