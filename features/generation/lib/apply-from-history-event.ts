/**
 * 生成結果一覧（リスト表示）の「次の生成に使う」ボタンが押された時に
 * GenerationForm 側へ「この画像を人物アップロードに差し込んで」と通知する
 * カスタムイベントの定義。
 *
 * 既に `tutorial:set-prompt` / `tutorial:set-demo-image` などの event-driven
 * 連携パターンが存在するので、それと整合的に CustomEvent で繋ぐ。
 */

export const COORDINATE_APPLY_FROM_HISTORY_EVENT =
  "coordinate:apply-from-history";

export interface CoordinateApplyFromHistoryDetail {
  imageUrl: string;
  /** ファイル名のヒント（拡張子推測用）。なくても動く。 */
  fileNameHint?: string;
}
