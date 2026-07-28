import type { GenerationType } from "@/features/generation/types";

/**
 * generated_images.generation_type を、投稿カード/詳細に出す生成モードラベルの
 * i18n キー("posts" namespace)へ変換する。
 *
 * - coordinate 系(coordinate / specified_coordinate / full_body / chibi)は
 *   まとめて「コーディネート」に集約する(旧派生タイプもコーディネート扱い)。
 * - one_tap_style → One-Tap Style、inspire → 投稿スタイル、free → じゆう。
 * - 未知 / null は null を返し、呼び出し側はラベルを描画しない。
 *
 * 返すのは "posts" namespace のキー名。呼び出し側で useTranslations("posts") の
 * t(key) に渡す。
 */
export function getGenerationModeLabelKey(
  generationType: GenerationType | string | null | undefined,
): "modeCoordinate" | "modeOneTapStyle" | "modeInspire" | "modeFree" | null {
  switch (generationType) {
    case "coordinate":
    case "specified_coordinate":
    case "full_body":
    case "chibi":
      return "modeCoordinate";
    case "one_tap_style":
      return "modeOneTapStyle";
    case "inspire":
      return "modeInspire";
    case "free":
      return "modeFree";
    default:
      return null;
  }
}
