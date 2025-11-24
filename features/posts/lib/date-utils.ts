/**
 * JST（日本時間）基準の日付計算ユーティリティ関数
 * PostgreSQLはUTCで動作するため、JST基準の期間を計算してUTCに変換する
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // +9時間（ミリ秒）

/**
 * JST基準で今日の開始時刻（JST 00:00）をUTCのDateオブジェクトとして取得
 * @returns UTCのDateオブジェクト（JST 00:00に対応）
 */
export function getJSTStartOfDay(): Date {
  const now = new Date();
  // UTC時刻をJST時刻に変換
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  // JST時刻の年、月、日を取得
  const jstYear = jstNow.getUTCFullYear();
  const jstMonth = jstNow.getUTCMonth();
  const jstDate = jstNow.getUTCDate();
  // 今日のJST 00:00:00をUTC時刻で作成
  const utcTodayStart = new Date(Date.UTC(jstYear, jstMonth, jstDate, 0, 0, 0, 0));
  // JSTオフセットを引いて、JST 00:00:00に対応するUTC時刻を取得
  return new Date(utcTodayStart.getTime() - JST_OFFSET_MS);
}

/**
 * JST基準で今日の終了時刻（JST 23:59:59）をUTCのDateオブジェクトとして取得
 * @returns UTCのDateオブジェクト（今日のJST 23:59:59に対応）
 */
export function getJSTEndOfDay(): Date {
  const now = new Date();
  // UTC時刻をJST時刻に変換
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  // JST時刻の年、月、日を取得
  const jstYear = jstNow.getUTCFullYear();
  const jstMonth = jstNow.getUTCMonth();
  const jstDate = jstNow.getUTCDate();
  // 今日のJST 23:59:59をUTC時刻で作成
  const utcTodayEnd = new Date(Date.UTC(jstYear, jstMonth, jstDate, 23, 59, 59, 999));
  // JSTオフセットを引いて、JST 23:59:59に対応するUTC時刻を取得
  return new Date(utcTodayEnd.getTime() - JST_OFFSET_MS);
}

/**
 * JST基準で昨日の開始時刻（JST 00:00）をUTCのDateオブジェクトとして取得
 * @returns UTCのDateオブジェクト（昨日のJST 00:00に対応）
 */
export function getJSTYesterdayStart(): Date {
  const now = new Date();
  // UTC時刻をJST時刻に変換
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  // JST時刻の年、月、日を取得
  const jstYear = jstNow.getUTCFullYear();
  const jstMonth = jstNow.getUTCMonth();
  const jstDate = jstNow.getUTCDate();
  // 昨日のJST 00:00:00をUTC時刻で作成
  // UTC時刻でDateオブジェクトを作成（UTC 00:00:00）
  const utcYesterdayStart = new Date(Date.UTC(jstYear, jstMonth, jstDate - 1, 0, 0, 0, 0));
  // JSTオフセットを引いて、JST 00:00:00に対応するUTC時刻を取得
  return new Date(utcYesterdayStart.getTime() - JST_OFFSET_MS);
}

/**
 * JST基準で昨日の終了時刻（JST 23:59:59）をUTCのDateオブジェクトとして取得
 * @returns UTCのDateオブジェクト（昨日のJST 23:59:59に対応）
 */
export function getJSTYesterdayEnd(): Date {
  const now = new Date();
  // UTC時刻をJST時刻に変換
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  // JST時刻の年、月、日を取得
  const jstYear = jstNow.getUTCFullYear();
  const jstMonth = jstNow.getUTCMonth();
  const jstDate = jstNow.getUTCDate();
  // 昨日のJST 23:59:59をUTC時刻で作成
  // UTC時刻でDateオブジェクトを作成（UTC 23:59:59）
  const utcYesterdayEnd = new Date(Date.UTC(jstYear, jstMonth, jstDate - 1, 23, 59, 59, 999));
  // JSTオフセットを引いて、JST 23:59:59に対応するUTC時刻を取得
  return new Date(utcYesterdayEnd.getTime() - JST_OFFSET_MS);
}

/**
 * JST基準で先週の開始時刻（JST 日曜日 00:00）をUTCのDateオブジェクトとして取得
 * 先週は日曜日00:00から土曜日23:59まで
 * @returns UTCのDateオブジェクト（先週の日曜日JST 00:00に対応）
 */
export function getJSTLastWeekStart(): Date {
  const jstStartOfDay = getJSTStartOfDay();
  // JST時刻に変換
  const jstDate = new Date(jstStartOfDay.getTime() + JST_OFFSET_MS);
  // 日曜日（0）を基準に、先週の日曜日を計算
  // getDay(): 0=日曜日, 1=月曜日, ..., 6=土曜日
  const dayOfWeek = jstDate.getDay();
  // 先週の日曜日までの日数を計算（日曜日が7日前、月曜日が8日前、...、土曜日が13日前）
  const daysToLastSunday = dayOfWeek + 7;
  // 先週の日曜日のJST 00:00を計算
  const jstLastSunday = new Date(jstDate);
  jstLastSunday.setDate(jstDate.getDate() - daysToLastSunday);
  jstLastSunday.setHours(0, 0, 0, 0);
  // UTCに戻す
  return new Date(jstLastSunday.getTime() - JST_OFFSET_MS);
}

/**
 * JST基準で先週の終了時刻（JST 土曜日 23:59:59）をUTCのDateオブジェクトとして取得
 * @returns UTCのDateオブジェクト（先週の土曜日JST 23:59:59に対応）
 */
export function getJSTLastWeekEnd(): Date {
  const jstLastWeekStart = getJSTLastWeekStart();
  // JST時刻に変換
  const jstDate = new Date(jstLastWeekStart.getTime() + JST_OFFSET_MS);
  // 土曜日（6日後）の23:59:59に設定
  const jstLastSaturday = new Date(jstDate);
  jstLastSaturday.setDate(jstDate.getDate() + 6);
  jstLastSaturday.setHours(23, 59, 59, 999);
  // UTCに戻す
  return new Date(jstLastSaturday.getTime() - JST_OFFSET_MS);
}

/**
 * JST基準で先月の開始時刻（JST 1日 00:00）をUTCのDateオブジェクトとして取得
 * @returns UTCのDateオブジェクト（先月の1日JST 00:00に対応）
 */
export function getJSTLastMonthStart(): Date {
  const jstStartOfDay = getJSTStartOfDay();
  // JST時刻に変換
  const jstDate = new Date(jstStartOfDay.getTime() + JST_OFFSET_MS);
  // 先月の1日のJST 00:00を計算
  const jstLastMonthFirstDay = new Date(jstDate.getFullYear(), jstDate.getMonth() - 1, 1, 0, 0, 0, 0);
  // UTCに戻す
  return new Date(jstLastMonthFirstDay.getTime() - JST_OFFSET_MS);
}

/**
 * JST基準で先月の終了時刻（JST 月末 23:59:59）をUTCのDateオブジェクトとして取得
 * @returns UTCのDateオブジェクト（先月の月末JST 23:59:59に対応）
 */
export function getJSTLastMonthEnd(): Date {
  const jstStartOfDay = getJSTStartOfDay();
  // JST時刻に変換
  const jstDate = new Date(jstStartOfDay.getTime() + JST_OFFSET_MS);
  // 先月の月末日を計算（先月の次の月の0日目 = 先月の最終日）
  // 例: 今月が11月の場合、先月は10月、先月の次の月は11月、11月の0日目は10月31日
  const jstLastMonthEnd = new Date(jstDate.getFullYear(), jstDate.getMonth(), 0, 23, 59, 59, 999);
  // UTCに戻す
  return new Date(jstLastMonthEnd.getTime() - JST_OFFSET_MS);
}

