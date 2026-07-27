/**
 * ジョブ種別ごとの出力アスペクト比を一元的に解決する pure helper。
 *
 * Worker (Deno) の Gemini 経路 / OpenAI 経路で条件がずれる事故を防ぐため、
 * 比率決定を1箇所に集約する。`generation_type` で明示分岐し、
 * 「generation_metadata にキーがあれば適用」のような存在ベース分岐はしない
 * (将来 coordinate 等が同名キーを持っても影響させない)。
 *
 * Edge Function (Deno) / Next.js (Node) 双方から import するため pure TypeScript。
 */
import type { GenerationType } from "./prompt-core.ts";
import {
  resolveGeminiAspectRatio,
  type GeminiAspectRatio,
} from "./gemini-aspect-ratio.ts";
import {
  normalizeStyleOutputAspectRatioMode,
  normalizeFreeOutputAspectRatioMode,
  resolveOutputAspectRatio,
} from "./style-output-aspect-ratio.ts";

interface Dimensions {
  width: number;
  height: number;
}

export interface ResolveJobOutputAspectRatioParams {
  /** ジョブの生成種別。 */
  generationType: GenerationType | string | null | undefined;
  /** image_jobs.generation_metadata (free はここに outputAspectRatioMode を持つ)。 */
  generationMetadata?: Record<string, unknown> | null;
  /** one_tap_style の preset 由来 metadata (outputAspectRatioMode / サムネ寸法)。 */
  oneTapStyleMetadata?: {
    outputAspectRatioMode?: unknown;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
  } | null;
  /** 出力比率の基準となる入力画像寸法 (source / フォールバック用)。 */
  inputDimensions?: Dimensions | null;
}

export interface JobOutputAspectRatio {
  /** Gemini `imageConfig.aspectRatio` へそのまま渡すラベル。 */
  label: GeminiAspectRatio;
  /**
   * OpenAI の targetSize を明示比率で上書きするか。
   * false のときは呼び出し側で targetSize=undefined とし、入力画像ベースの従来挙動を維持する。
   */
  shouldOverrideOpenAITargetSize: boolean;
}

function toValidDimensions(dims: Dimensions | null | undefined): Dimensions | null {
  return dims && dims.width > 0 && dims.height > 0 ? dims : null;
}

/**
 * 生成種別ごとに出力比率(Gemini ラベル)と OpenAI targetSize 上書き要否を返す。
 *
 * - one_tap_style: preset の outputAspectRatioMode を尊重(source / preset_image / 明示比率)。
 *   source、または preset_image でサムネ寸法が無い場合は入力ベース(OpenAI targetSize 維持)。
 * - free: generation_metadata.outputAspectRatioMode を Free 用に正規化(preset_image は不可、
 *   許容外は source)。明示比率のときだけ OpenAI targetSize を上書き。
 * - その他 (coordinate / inspire 等): 入力比率にスナップ。OpenAI targetSize は従来維持。
 */
export function resolveJobOutputAspectRatio(
  params: ResolveJobOutputAspectRatioParams,
): JobOutputAspectRatio {
  const { generationType, generationMetadata, oneTapStyleMetadata } = params;
  const inputDimensions = toValidDimensions(params.inputDimensions);

  if (generationType === "one_tap_style") {
    const mode = normalizeStyleOutputAspectRatioMode(
      oneTapStyleMetadata?.outputAspectRatioMode,
    );
    const presetImageDims: Dimensions | null =
      oneTapStyleMetadata &&
      typeof oneTapStyleMetadata.thumbnailWidth === "number" &&
      typeof oneTapStyleMetadata.thumbnailHeight === "number" &&
      oneTapStyleMetadata.thumbnailWidth > 0 &&
      oneTapStyleMetadata.thumbnailHeight > 0
        ? {
            width: oneTapStyleMetadata.thumbnailWidth,
            height: oneTapStyleMetadata.thumbnailHeight,
          }
        : null;
    // source、または preset_image でサムネ寸法が無い場合は入力ベース(= 明示上書きしない)。
    const usesSource =
      mode === "source" || (mode === "preset_image" && !presetImageDims);
    return {
      label: resolveOutputAspectRatio(mode, inputDimensions, presetImageDims),
      shouldOverrideOpenAITargetSize: !usesSource,
    };
  }

  if (generationType === "free") {
    const mode = normalizeFreeOutputAspectRatioMode(
      generationMetadata?.outputAspectRatioMode,
    );
    return {
      label: resolveOutputAspectRatio(mode, inputDimensions),
      shouldOverrideOpenAITargetSize: mode !== "source",
    };
  }

  // coordinate / inspire / その他: 従来どおり入力比率にスナップ。OpenAI は targetSize 維持。
  return {
    label: resolveGeminiAspectRatio(inputDimensions),
    shouldOverrideOpenAITargetSize: false,
  };
}
