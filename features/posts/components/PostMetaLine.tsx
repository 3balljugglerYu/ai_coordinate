"use client";

import { useTranslations } from "next-intl";
import { getModelBrandName } from "@/features/generation/lib/model-display";
import { getGenerationModeLabelKey } from "../lib/generation-mode-label";
import type { GenerationType } from "@/features/generation/types";

interface PostMetaLineProps {
  model: string | null;
  width: number | null;
  height: number | null;
  /** 生成モード(coordinate系/one_tap_style/inspire/free)。null/不明はラベル非表示。 */
  generationType?: GenerationType | string | null;
}

/**
 * Post 詳細画面のプロンプトブロック直前に表示するモデル / サイズ / 生成モード表示部品。
 *
 * 表示例:
 *   - `じゆう ・ ChatGPT Images 2.0 / 1024×1536`（モード + モデル + サイズ）
 *   - `コーディネート`（モデル不明・サイズ無しでもモードは出す）
 *   - 何も描画しない（モード不明 かつ モデル不明）
 *
 * `aria-label` でラベルを補完してスクリーンリーダーに正確な内容を伝える。
 */
export function PostMetaLine({
  model,
  width,
  height,
  generationType,
}: PostMetaLineProps) {
  const t = useTranslations("posts");
  const brandName = getModelBrandName(model);
  const modeLabelKey = getGenerationModeLabelKey(generationType);
  const modeLabel = modeLabelKey ? t(modeLabelKey) : null;

  // モデルもモードも無ければ従来どおり何も描画しない。
  if (!brandName && !modeLabel) {
    return null;
  }

  const hasDimensions =
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0;
  const dimensionsText = hasDimensions ? `${width}×${height}` : null;

  // 「モード ・ モデル / サイズ」の順に、存在する要素だけを組み立てる。
  const modelPart = brandName
    ? dimensionsText
      ? `${brandName} / ${dimensionsText}`
      : brandName
    : null;
  const visibleText = [modeLabel, modelPart].filter(Boolean).join(" ・ ");

  const ariaParts: string[] = [];
  if (modeLabel) ariaParts.push(`${t("metaModeLabel")}: ${modeLabel}`);
  if (brandName) ariaParts.push(`${t("metaModelLabel")}: ${brandName}`);
  if (dimensionsText) ariaParts.push(`${t("metaSizeLabel")}: ${dimensionsText}`);
  const ariaLabel = ariaParts.join(", ");

  return (
    <div
      className="border-t border-gray-200 bg-white px-4 py-2"
      aria-label={ariaLabel}
      data-testid="post-meta-line"
    >
      <span className="text-xs text-gray-500">{visibleText}</span>
    </div>
  );
}
