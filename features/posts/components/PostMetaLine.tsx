"use client";

import { useTranslations } from "next-intl";
import { getModelBrandName } from "@/features/generation/lib/model-display";

interface PostMetaLineProps {
  model: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Post 詳細画面のプロンプトブロック直前に表示するモデル / サイズ表示部品。
 *
 * 表示例:
 *   - `ChatGPT Images 2.0 / 1024×1536`（width/height あり）
 *   - `Nano Banana 2`（width/height NULL）
 *   - 何も描画しない（モデル不明 / null）
 *
 * `aria-label` でラベルを補完してスクリーンリーダーに正確な内容を伝える。
 */
export function PostMetaLine({ model, width, height }: PostMetaLineProps) {
  const t = useTranslations("posts");
  const brandName = getModelBrandName(model);
  if (!brandName) {
    return null;
  }

  const hasDimensions =
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0;
  const dimensionsText = hasDimensions ? `${width}×${height}` : null;

  const visibleText = dimensionsText
    ? `${brandName} / ${dimensionsText}`
    : brandName;
  const ariaLabel = dimensionsText
    ? `${t("metaModelLabel")}: ${brandName}, ${t("metaSizeLabel")}: ${dimensionsText}`
    : `${t("metaModelLabel")}: ${brandName}`;

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
