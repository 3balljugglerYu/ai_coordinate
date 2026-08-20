/**
 * ツールページの流入元タグ。
 *
 * `profiles.signup_source` に残す値で、書式は `parseSignupSource` と
 * DB の CHECK に合わせる(小文字英数 + `_` `-`、1..40文字)。
 *
 * ツールは未ログインで完結するため、ここを付けないと
 * 「ツールから来て登録した人」が1人も数えられない
 * (企画ページで同じ問題が起きていた。[[persta-campaign-report-dashboard]])。
 */
export const IMAGE_SPLIT_SIGNUP_SOURCE = "tool_image_split";
