/**
 * GA4 BigQuery の DAU/MAU 集計クエリビルダー(純粋・I/O なし)。
 * "アクセス" = page_view イベントを持つ訪問者。
 * DAU 系列は user property `logged_in`(Ga4LoginStatus が設定)で
 * ログイン / 未ログイン(ゲスト)/ 計測前(未取得)に分割集計する。
 * MAU は窓全体の総アクセス distinct(分割なし)。
 */

/** events テーブルから訪問者(user_pseudo_id + logged_in user property)を投影する生 SELECT */
export function buildDauRawSelect(
  tablePattern: string,
  suffixPredicate: string
): string {
  return `
    SELECT
      user_pseudo_id,
      event_timestamp,
      (SELECT value.string_value FROM UNNEST(user_properties) WHERE key = 'logged_in') AS logged_in
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

/**
 * DAU 日次系列(JST・GENERATE_DATE_ARRAY でゼロ埋め・昇順)を
 * ログイン状態(loggedIn / guest / unknown)で分割。
 * ユーザーはその日に logged_in='yes' が一度でもあれば loggedIn、無く 'no' があれば guest、
 * いずれも無ければ unknown(計測前/未取得)に分類する。
 */
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
    per_user_day AS (
      SELECT
        FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Tokyo')) AS date_key,
        user_pseudo_id,
        MAX(IF(logged_in = 'yes', 1, 0)) AS has_logged_in,
        MAX(IF(logged_in = 'no', 1, 0)) AS has_guest
      FROM raw_users
      GROUP BY date_key, user_pseudo_id
    ),
    aggregated AS (
      SELECT
        date_key,
        COUNTIF(has_logged_in = 1) AS loggedIn,
        COUNTIF(has_logged_in = 0 AND has_guest = 1) AS guest,
        COUNTIF(has_logged_in = 0 AND has_guest = 0) AS unknown
      FROM per_user_day
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
      COALESCE(aggregated.loggedIn, 0) AS loggedIn,
      COALESCE(aggregated.guest, 0) AS guest,
      COALESCE(aggregated.unknown, 0) AS unknown
    FROM date_series
    LEFT JOIN aggregated
      ON date_series.date_key = aggregated.date_key
    ORDER BY dateKey ASC
  `;
}

/** MAU スカラー(窓全体の総アクセス distinct 訪問者・分割なし) */
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
