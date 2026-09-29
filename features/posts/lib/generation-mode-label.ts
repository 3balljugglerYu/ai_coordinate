import type { GenerationType } from "@/features/generation/types";

/** 生成モードラベルの i18n キー("posts" namespace)。 */
export type GenerationModeLabelKey =
  | "modeCoordinate"
  | "modeOneTapStyle"
  | "modeInspire"
  | "modeFree"
  | "modeWithPerstaOriginal"
  | "modeWithUserOriginal"
  | "modeUserOriginal";

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
 * カタログのタブの名前(Persta ORIGINAL / User ORIGINAL)に合わせる。
 * ⭐ **作った本人のものは「ORIGINAL」、それを使って作ったものは「with 〜」**にする
 * (2026-09-29 ユーザー決定)。使っただけの投稿に「Persta ORIGINAL」と付けると、
 * 投稿者がそのオリジナルを作ったように見えるため。
 *
 * | 生成 | ラベル |
 * |---|---|
 * | one_tap_style(ペルスタのスタイル) | with Persta ORIGINAL |
 * | free・元の投稿あり(ほかの人のプロンプト) | with User ORIGINAL |
 * | free・元の投稿なし(自分のプロンプト) | User ORIGINAL |
 * | coordinate 系 / inspire | 今のまま |
 *
 * 画像の上のラベルでは with 〜 を出さない({@link getCardGenerationModeLabelKey})。
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
  }: {
    /** 派生生成の原作(`source_post_id`)。刷新後に自分のプロンプトかを見分ける。 */
    sourcePostId?: string | null;
    /** カタログ刷新後の名前にするか。`useStylesCatalogRevamp()` の値を渡す。 */
    isCatalogRevamp?: boolean;
  } = {},
): GenerationModeLabelKey | null {
  switch (generationType) {
    case "coordinate":
    case "specified_coordinate":
    case "full_body":
    case "chibi":
      return "modeCoordinate";
    case "one_tap_style":
      return isCatalogRevamp ? "modeWithPerstaOriginal" : "modeOneTapStyle";
    case "inspire":
      return "modeInspire";
    case "free":
      if (!isCatalogRevamp) {
        return "modeFree";
      }
      return sourcePostId ? "modeWithUserOriginal" : "modeUserOriginal";
    default:
      return null;
  }
}

/**
 * 画像の上(カードの左下)に出す生成モードラベルのキー。
 *
 * カタログ刷新後は、**使って作った投稿(with 〜)には出さない**(2026-09-30 ユーザー決定)。
 * 出どころは画像の下の引用元カード(Persta ORIGINAL / User ORIGINAL)が示すので、
 * 画像の上で繰り返す必要がない。「with Persta ORIGINAL」は長く、狭いカードでは
 * 2行になって画像を隠すことも理由。自分のプロンプトの投稿(User ORIGINAL)と、
 * Coordinate / Creator Style は出す。
 *
 * 投稿の詳細の「生成モード」の行は1行の文なので、こちらではなく
 * {@link getGenerationModeLabelKey} をそのまま使い、with 〜 も出す。
 */
export function getCardGenerationModeLabelKey(
  generationType: GenerationType | string | null | undefined,
  options: { sourcePostId?: string | null; isCatalogRevamp?: boolean } = {},
): GenerationModeLabelKey | null {
  const key = getGenerationModeLabelKey(generationType, options);
  return key === "modeWithPerstaOriginal" || key === "modeWithUserOriginal" ? null : key;
}
