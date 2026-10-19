/**
 * 個人あてのお知らせの上限と印。DB(20261018120000_add_personal_notices.sql)の
 * CHECK / send_personal_notice と同じ値にする。
 */
export const PERSONAL_NOTICE_MAX_RECIPIENTS = 200;
export const PERSONAL_NOTICE_MEMO_MAX = 100;
export const PERSONAL_NOTICE_TITLE_MAX = 60;
export const PERSONAL_NOTICE_BODY_MAX = 2000;
export const PERSONAL_NOTICE_CODE_PLACEHOLDER = "{受付番号}";
export const PERSONAL_NOTICE_CODE_PREFIX_PATTERN = /^[A-Z]{2,5}$/;
/** プレビューに出す番号の例(実際の番号は送るときに1人ずつ作る) */
export const PERSONAL_NOTICE_SAMPLE_CODE_SUFFIX = "7F3K";

export function bodyUsesReceiptCode(body: string): boolean {
  return body.includes(PERSONAL_NOTICE_CODE_PLACEHOLDER);
}

/** DB の char_length と同じ数え方(絵文字も1文字)。JS の length は絵文字を2と数える */
export function countChars(value: string): number {
  return [...value].length;
}
