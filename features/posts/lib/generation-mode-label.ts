import type { GenerationType } from "@/features/generation/types";

/** 生成モードラベルの i18n キー("posts" namespace)。 */
export type GenerationModeLabelKey =
  | "modeCoordinate"
  | "modeOneTapStyle"
  | "modeInspire"
  | "modeFree"
  | "modeFromCatalog"
  | "modeUserOriginal"
  | "modeMyOriginal";

/**
 * generated_images.generation_type を、投稿カード/詳細に出す生成モードラベルの
 * i18n キー("posts" namespace)へ変換する。
 *
 * - coordinate 系(coordinate / specified_coordinate / full_body / chibi)は
 *   まとめて「コーディネート」に集約する(旧派生タイプもコーディネート扱い)。
 * - one_tap_style → One-Tap Style、inspire → 投稿スタイル、free → じゆう。
 * - 未知 / null は null を返し、呼び出し側はラベルを描画しない。
 *
 * ## カタログ刷新後(`isCatalogRevamp`。公開前は運営だけ)
 *
 * ⭐ **「ORIGINAL」は原本だけに付け、カタログの原本を使って作ったものは
 * 「from CATALOG」にする**(2026-09-30 ユーザー決定。My / User ORIGINAL にそろえて英語、全言語同一)。使っただけの投稿に
 * 「Persta ORIGINAL」と付けると、投稿者がそのオリジナルを作ったように見えるため。
 * 原本は、見ている人が作者本人なら「My ORIGINAL」、ほかの人には「User ORIGINAL」。
 *
 * | 生成 | ラベル |
 * |---|---|
 * | one_tap_style(Persta のカタログのスタイル) | from CATALOG |
 * | free・元の投稿あり(ほかの人のカタログ) | from CATALOG |
 * | free・元の投稿なし(自分のプロンプト=原本)を本人が見る | My ORIGINAL |
 * | 同上をほかの人が見る | User ORIGINAL |
 * | coordinate 系 / inspire | 今のまま |
 *
 * 自分のプロンプトかどうかは `source_post_id`(派生生成の原作)の有無で決まる。
 * 元の投稿を持つのは free だけ(本番実測。one_tap_style などには入らない)。
 *
 * 返すのは "posts" namespace のキー名。呼び出し側で useTranslations("posts") の
 * t(key) に渡す。
 */
export function getGenerationModeLabelKey(
  generationType: GenerationType | string | null | undefined,
  {
    sourcePostId = null,
    isCatalogRevamp = false,
    isViewerResolved = true,
    isViewerAuthor = false,
  }: {
    /** 派生生成の原作(`source_post_id`)。刷新後に自分のプロンプトかを見分ける。 */
    sourcePostId?: string | null;
    /** カタログ刷新後の名前にするか。`useStylesCatalogRevamp()` の値を渡す。 */
    isCatalogRevamp?: boolean;
    /**
     * 見ている人(ログイン中の人)が確定したか。確定前は本人かどうかが分からないので、
     * 原本のラベルは出さずに待つ(「User ORIGINAL」→「My ORIGINAL」と書き換わる
     * ちらつきを避ける。2026-09-30 ユーザー指摘)。サーバーで確定済みなら既定の true。
     */
    isViewerResolved?: boolean;
    /** 見ている人が投稿者本人か。本人には「My ORIGINAL」を出す。 */
    isViewerAuthor?: boolean;
  } = {},
): GenerationModeLabelKey | null {
  switch (generationType) {
    case "coordinate":
    case "specified_coordinate":
    case "full_body":
    case "chibi":
      return "modeCoordinate";
    case "one_tap_style":
      return isCatalogRevamp ? "modeFromCatalog" : "modeOneTapStyle";
    case "inspire":
      return "modeInspire";
    case "free":
      if (!isCatalogRevamp) {
        return "modeFree";
      }
      if (sourcePostId) {
        return "modeFromCatalog";
      }
      if (!isViewerResolved) {
        return null;
      }
      return isViewerAuthor ? "modeMyOriginal" : "modeUserOriginal";
    default:
      return null;
  }
}
