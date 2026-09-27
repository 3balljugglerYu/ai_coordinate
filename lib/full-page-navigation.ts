/**
 * ページを読み込み直して遷移する(クライアント遷移ではなく全画面遷移)。
 *
 * ルートレイアウトに常駐するヘッダー等の状態も含めて作り直したいとき(ログアウト後など)に使う。
 * jsdom では window.location.assign を差し替えられないため、テストではこのモジュールをモックする。
 */
export function navigateFullPage(url: string): void {
  window.location.assign(url);
}
