import { trackEvent } from "@/features/analytics/lib/track-event";
import type { SplitMode } from "./split-image";

/**
 * 画像分割ツールの利用イベント。
 *
 * ## なぜ要るか
 *
 * このツールは**すべてブラウザ内で完結する**ので、サーバーにもDBにも
 * 「使われた」痕跡が一切残らない。GA4 の page_view だけだと
 * 「開いた数」しか分からず、開いたが使わなかった人と区別できない。
 * 実測(2026-08-22)で2日54UUの流入があり、歩留まりを見る価値が出たため足す。
 *
 * ## 送らないもの
 *
 * ファイル名・画像サイズ・objectURL は**送らない**。「画像はサーバーに
 * アップロードされません」と書いているページなので、そこから推測できる値を
 * 計測に流すのは約束と矛盾する。送るのは分割方法・枚数・保存手段だけ。
 */

/** 保存の手段。実機での分岐(モバイル=共有 / PC=ダウンロード)と対応する。 */
export type ImageSplitSaveMethod = "share" | "download";

/** 分割が成功したとき。分母は page_view、分子がこれになる。 */
export function trackImageSplitRun(mode: SplitMode, pieceCount: number): void {
  trackEvent("image_split_run", {
    split_mode: mode,
    piece_count: pieceCount,
  });
}

/** 1枚だけ保存したとき。 */
export function trackImageSplitSavePiece(method: ImageSplitSaveMethod): void {
  trackEvent("image_split_save_piece", { save_method: method });
}

/** まとめて保存・共有したとき。ここまで来た人が「使い切った人」。 */
export function trackImageSplitSaveAll(
  method: ImageSplitSaveMethod,
  pieceCount: number,
): void {
  trackEvent("image_split_save_all", {
    save_method: method,
    piece_count: pieceCount,
  });
}

/**
 * 失敗したとき。読み込めない形式(HEIC 等)がどれくらいあるかを知る。
 * 理由は**こちらで決めた定数のみ**。例外メッセージをそのまま送らない
 * (ブラウザ由来の文字列にファイル名が混じることがある)。
 */
export type ImageSplitFailureReason = "decode_failed" | "not_an_image";

export function trackImageSplitFailed(reason: ImageSplitFailureReason): void {
  trackEvent("image_split_failed", { reason });
}
