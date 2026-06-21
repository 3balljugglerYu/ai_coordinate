/**
 * Gemini 画像生成 API 向け aspect ratio 解決ユーティリティ。
 *
 * 入力画像のアスペクト比を 9 段階の離散値 (9:16 〜 16:9) のうち最も近いものに丸める。
 * 範囲外 (1:3 や 3:1 等の極端な縦長/横長) は 9:16 / 16:9 にクランプする。
 *
 * Edge Function (Deno) と Next.js (Node) の双方から import するため、ランタイム
 * 依存を持たない pure TypeScript として実装する。
 *
 * 計画書: docs/planning/image-output-aspect-ratio-clamp-plan.md (ADR-001/003)
 */

export type GeminiAspectRatio =
  | "9:16"
  | "4:5"
  | "3:4"
  | "2:3"
  | "1:1"
  | "3:2"
  | "4:3"
  | "5:4"
  | "16:9";

interface GeminiAspectRatioEntry {
  label: GeminiAspectRatio;
  value: number; // width / height
}

/**
 * 全 Gemini モデル (NanoBanana / NanoBanana 2 / NanoBanana Pro) で共通サポートされる
 * 9 段階のアスペクト比 (ADR-003)。1:4, 4:1, 8:1 等は本目的のクランプ範囲外のため除外。
 */
export const GEMINI_SUPPORTED_ASPECT_RATIOS: readonly GeminiAspectRatioEntry[] =
  [
    { label: "9:16", value: 9 / 16 },
    { label: "4:5", value: 4 / 5 },
    { label: "3:4", value: 3 / 4 },
    { label: "2:3", value: 2 / 3 },
    { label: "1:1", value: 1 },
    { label: "3:2", value: 3 / 2 },
    { label: "4:3", value: 4 / 3 },
    { label: "5:4", value: 5 / 4 },
    { label: "16:9", value: 16 / 9 },
  ];

const MIN_RATIO = 9 / 16;
const MAX_RATIO = 16 / 9;
const FALLBACK_RATIO: GeminiAspectRatio = "1:1";

/**
 * "16:9" などの比率ラベルを {width, height} に変換する。
 * OpenAI(GPT Image 2)の出力サイズ決定(getGptImage2TargetSize)に渡す用途。
 */
export function aspectLabelToDimensions(label: GeminiAspectRatio): {
  width: number;
  height: number;
} {
  const [w, h] = label.split(":").map(Number);
  return { width: w, height: h };
}

/**
 * 入力画像の dimensions から Gemini 用 aspectRatio ラベルを解決する。
 *
 * - dimensions が null / 無効値 (width<=0 / height<=0) → "1:1" にフォールバック
 * - 9/16 ≤ aspect ≤ 16/9 の範囲にクランプ
 * - 9 段階の中で log(aspect) 距離が最小のラベルを選択 (幾何平均的に最近傍)
 */
export function resolveGeminiAspectRatio(
  dimensions: { width: number; height: number } | null | undefined,
): GeminiAspectRatio {
  if (
    dimensions == null ||
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    return FALLBACK_RATIO;
  }

  const rawAspect = dimensions.width / dimensions.height;
  const clampedAspect = Math.max(MIN_RATIO, Math.min(MAX_RATIO, rawAspect));
  const targetLog = Math.log(clampedAspect);

  let bestLabel: GeminiAspectRatio = FALLBACK_RATIO;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of GEMINI_SUPPORTED_ASPECT_RATIOS) {
    const distance = Math.abs(Math.log(entry.value) - targetLog);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLabel = entry.label;
    }
  }
  return bestLabel;
}
