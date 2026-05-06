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

/**
 * /style の「このイラストで生成」確認後 → /coordinate 遷移時に、
 * 画像 URL を持ち越すための sessionStorage キー。
 * /coordinate ページの GenerationForm が mount 時に値を取り出し、
 * `coordinate:apply-from-history` イベントを発火する。
 */
export const COORDINATE_PENDING_SOURCE_IMAGE_KEY =
  "persta-ai:coordinate-pending-source-image-url";
