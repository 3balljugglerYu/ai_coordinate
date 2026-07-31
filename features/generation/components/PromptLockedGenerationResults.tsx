"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GeneratedImageGallery } from "./GeneratedImageGallery";
import { useGenerationState } from "../context/GenerationStateContext";
import { getGeneratedImages } from "../lib/database";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import type { GeneratedImageData } from "../types";

/**
 * 直近の生成をいくつ出すか。
 *
 * `/free` の一覧と同じ 4 件にしている。シートの中なので、これ以上並べると
 * モバイルのボトムシートが延々と伸びる。過去の分をすべて見たい人は
 * `/free` へ行けばよい。
 */
const RECENT_LIMIT = 4;

/**
 * 派生生成シート内の結果一覧。
 *
 * 「Free Style と同じことをしている」画面なので、`/free` と同じく
 * **そのシートで作った分 + 過去のじゆうモード生成**を並べる。
 *
 * シートで作った分だけを出していた頃は、閉じたあとに作ったものが
 * どこへ行ったのか分からなかった。過去の分と一緒に並んでいれば
 * 「いつもの場所に貯まっている」ことがその場で伝わる。
 *
 * 新しいものが先頭に来るよう、プロバイダの `previewImages` を過去分より
 * 前に置く。ID が重なった分は先頭側を残す（生成直後に DB からも引けた場合、
 * 進捗つきのプレビュー側を優先したい）。
 *
 * `GeneratedImageGallery` をそのまま使うので、拡大表示と投稿モーダルも
 * 付いてくる。シートを閉じずに投稿まで進める。
 */
export function PromptLockedGenerationResults() {
  const t = useTranslations("free");
  const generationState = useGenerationState();
  const [recentImages, setRecentImages] = useState<GeneratedImageData[]>([]);

  const previewImages = generationState?.previewImages;
  const isGenerating = generationState?.isGenerating ?? false;
  const generatingCount = generationState?.generatingCount ?? 0;

  /*
    過去のじゆうモード生成を取りに行く。

    サーバーコンポーネントの一覧 (CachedGeneratedImageGallery) は投稿詳細
    ページから使えないため、ブラウザの Supabase クライアントで引く。
    RLS が本人の行だけに絞るので、他人の生成物は返らない。

    生成が終わるたびに引き直して、投稿済みバッジなどの状態を追従させる。
  */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const user = await getCurrentUser();
      if (!user || cancelled) return;

      const records = await getGeneratedImages(
        user.id,
        RECENT_LIMIT,
        0,
        "free"
      ).catch(() => []);
      if (cancelled) return;

      setRecentImages(
        records.flatMap((record) =>
          record.id
            ? [
                {
                  id: record.id,
                  url: record.image_url,
                  is_posted: record.is_posted ?? false,
                  createdAt: record.created_at,
                  model: record.model ?? null,
                  width: record.width ?? null,
                  height: record.height ?? null,
                  preGenerationStoragePath:
                    record.pre_generation_storage_path ?? null,
                  showBeforeImage: record.show_before_image ?? true,
                  sourcePostId: record.source_post_id ?? null,
                } satisfies GeneratedImageData,
              ]
            : []
        )
      );
    };

    void load();
    return () => {
      cancelled = true;
    };
    // 生成中フラグが落ちた（＝完了した）タイミングで引き直す
  }, [isGenerating]);

  // 新しいものを先頭に。ID が重なったら先頭側を残す。
  const seen = new Set<string>();
  const images = [...(previewImages ?? []), ...recentImages].filter((image) => {
    if (seen.has(image.id)) return false;
    seen.add(image.id);
    return true;
  });

  // 生成前で過去分も無ければ何も出さない。空の見出しだけが残ると失敗に見える。
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
