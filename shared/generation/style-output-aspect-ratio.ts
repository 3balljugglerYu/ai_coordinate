/**
 * preset_categories.output_aspect_ratio_mode の正規化と、最終出力アスペクト比の解決。
 *
 * モード:
 * - "source"  … アップロード画像の比率に合わせて自動選択(9段階の最近傍にスナップ)
 * - 明示比率   … "9:16" 〜 "16:9" の固定比率(コーディネート/style の自動選択と同じ9段階)
 * - "square"  … 旧仕様の別名。正規化時に "1:1" として扱う(後方互換)
 *
 * Edge Function (Deno) / Next.js (Node) 双方から import するため pure TypeScript。
 */
import {
  GEMINI_SUPPORTED_ASPECT_RATIOS,
  resolveGeminiAspectRatio,
  type GeminiAspectRatio,
} from "./gemini-aspect-ratio.ts";

/** 明示指定できる比率(自動選択が使う9段階と一致)。 */
export const EXPLICIT_OUTPUT_ASPECT_RATIOS: readonly GeminiAspectRatio[] =
  GEMINI_SUPPORTED_ASPECT_RATIOS.map((entry) => entry.label);

/** admin で選択できる出力比率モード。"source"(自動) + "preset_image"(登録画像) + 明示9比率。 */
export const STYLE_OUTPUT_ASPECT_RATIO_MODES = [
  "source",
  "preset_image",
  "9:16",
  "4:5",
  "3:4",
  "2:3",
  "1:1",
  "3:2",
  "4:3",
  "5:4",
  "16:9",
] as const;

export type StyleOutputAspectRatioMode =
  (typeof STYLE_OUTPUT_ASPECT_RATIO_MODES)[number];

const EXPLICIT_SET: ReadonlySet<string> = new Set(EXPLICIT_OUTPUT_ASPECT_RATIOS);

export function isStyleOutputAspectRatioMode(
  value: unknown,
): value is StyleOutputAspectRatioMode {
  return (
    value === "source" ||
    value === "preset_image" ||
    (typeof value === "string" && EXPLICIT_SET.has(value))
  );
}

export function normalizeStyleOutputAspectRatioMode(
  value: unknown,
): StyleOutputAspectRatioMode {
  // 旧仕様 "square" は 1:1 として扱う(後方互換)。
  if (value === "square") return "1:1";
  return isStyleOutputAspectRatioMode(value) ? value : "source";
}

/**
 * モード + 入力画像寸法(+ 登録画像寸法)から、最終的な Gemini 出力アスペクト比を解決する。
 * - "source"       … 入力寸法を9段階の最近傍にスナップ(自動選択)
 * - "preset_image" … preset のサムネ(登録画像)寸法を9段階の最近傍にスナップ。
 *                     寸法が無いときは入力寸法にフォールバック(= source と同挙動)。
 *                     ※ サムネ寸法はDB保存済みの整数のみ使うため、画像処理は発生しない。
 * - 明示比率        … その比率をそのまま使う
 */
export function resolveOutputAspectRatio(
  mode: unknown,
  inputDimensions: { width: number; height: number } | null | undefined,
  presetImageDimensions?: { width: number; height: number } | null | undefined,
): GeminiAspectRatio {
  const normalized = normalizeStyleOutputAspectRatioMode(mode);
  if (normalized === "source") {
    return resolveGeminiAspectRatio(inputDimensions);
  }
  if (normalized === "preset_image") {
    return resolveGeminiAspectRatio(presetImageDimensions ?? inputDimensions);
  }
  return normalized;
}

/**
 * 1:1 固定かどうか(OpenAI/GPT Image 2 の正方形 targetSize 判定など、
 * 比率を直接渡せない経路で使う後方互換ヘルパー)。
 */
export function shouldForceSquareStyleOutput(mode: unknown): boolean {
  return normalizeStyleOutputAspectRatioMode(mode) === "1:1";
}
