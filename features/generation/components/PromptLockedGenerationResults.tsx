"use client";

import { useTranslations } from "next-intl";
import { GeneratedImageGallery } from "./GeneratedImageGallery";
import { useGenerationState } from "../context/GenerationStateContext";

/**
 * 派生生成シート内の結果一覧。
 *
 * シートは自前の `GenerationStateProvider` を持つので、ここに積まれた
 * `previewImages` がそのまま「このシートで作ったもの」になる。
 * これを描画していなかったため、生成しても完成画像が出ないままだった。
 *
 * `/free` のようにサーバー側の一覧と混ぜない。シートは1回の生成に閉じた
 * 場所で、過去の生成物まで並べると「今作ったのはどれか」が分からなくなる。
 *
 * `GeneratedImageGallery` をそのまま使うので、拡大表示と投稿モーダルも
 * 付いてくる。シートを閉じずに投稿まで進める。
 */
export function PromptLockedGenerationResults() {
  const t = useTranslations("free");
  const generationState = useGenerationState();

  const images = generationState?.previewImages ?? [];
  const isGenerating = generationState?.isGenerating ?? false;
  const generatingCount = generationState?.generatingCount ?? 0;

  // 生成前は何も出さない。空の見出しだけが残ると、失敗したように見える。
  if (images.length === 0 && !isGenerating) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-gray-900">
        {t("resultsTitle")}
      </h3>
      <GeneratedImageGallery
        images={images}
        isGenerating={isGenerating}
        generatingCount={generatingCount}
        generationType="free"
      />
    </div>
  );
}
