/**
 * GA4 のカスタムイベントを送る最小のヘルパー。
 *
 * `Ga4Script` が読み込まれていれば `window.gtag` が生えている。
 * 未設定の環境(ローカル・プレビュー)や広告ブロックで gtag が無いことは
 * **正常**なので、その場合は黙って何もしない。計測のために画面を壊さない。
 *
 * ## 送ってよい値
 *
 * パラメータは**集計に使う定数だけ**にすること。ファイル名・URL・入力文字列
 * などユーザー由来の値は送らない。とくに画像分割ツールは「画像はどこにも
 * 送られません」が売りなので、そこから漏れる値を足すと約束を破ることになる。
 */

/** GA4 のパラメータに載せてよい値。 */
export type AnalyticsEventParams = Record<string, string | number | boolean>;

export function trackEvent(
  name: string,
  params: AnalyticsEventParams = {},
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }
  try {
    window.gtag("event", name, params);
  } catch {
    // 計測の失敗で操作を止めない
  }
}
