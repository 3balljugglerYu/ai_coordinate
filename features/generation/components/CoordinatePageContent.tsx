 "use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { GenerationForm } from "./GenerationForm";
import { GeneratedImageGallery } from "./GeneratedImageGallery";
import {
  generateAndSaveImages,
  getCurrentUserId,
} from "../lib/generation-service";
import type { GeneratedImageData } from "../types";
import { getGeneratedImages } from "../lib/database";

const PAGE_SIZE = 4;

export function CoordinatePageContent() {
  // 過去の生成画像（DBから取得した履歴）
  const [historyImages, setHistoryImages] = useState<GeneratedImageData[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingCount, setGeneratingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "200px",
    triggerOnce: false,
  });

  // GeneratedImageRecord -> GeneratedImageData 変換
  const convertRecordToImageData = (record: {
    id?: string;
    image_url: string;
  }): GeneratedImageData | null => {
    if (!record.id) return null;
    return {
      id: record.id,
      url: record.image_url,
    };
  };

  // 初期表示: 最新の coordinate 画像を 4 件取得
  useEffect(() => {
    const fetchInitialHistory = async () => {
      try {
        setIsLoadingHistory(true);
        const userId = await getCurrentUserId();
        if (!userId) {
          // 未ログインの場合は履歴取得をスキップ
          setHasMoreHistory(false);
          return;
        }
        const records = await getGeneratedImages(
          userId,
          PAGE_SIZE,
          0,
          "coordinate"
        );

        const converted = records
          .map(convertRecordToImageData)
          .filter((img): img is GeneratedImageData => img !== null);

        setHistoryImages(converted);
        setHistoryOffset(records.length);
        setHasMoreHistory(records.length === PAGE_SIZE);
      } catch (err) {
        console.error("[CoordinatePageContent] 初期履歴取得エラー:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    void fetchInitialHistory();
  }, []);

  // 無限スクロール: 最下部が表示されたら追加で 4 件取得
  useEffect(() => {
    if (!inView || isLoadingHistory || !hasMoreHistory) return;

    const fetchMoreHistory = async () => {
      try {
        setIsLoadingHistory(true);
        const userId = await getCurrentUserId();
        if (!userId) {
          setHasMoreHistory(false);
          return;
        }
        const records = await getGeneratedImages(
          userId,
          PAGE_SIZE,
          historyOffset,
          "coordinate"
        );

        const converted = records
          .map(convertRecordToImageData)
          .filter((img): img is GeneratedImageData => img !== null);

        setHistoryImages((prev) => {
          const existingIds = new Set(prev.map((img) => img.id));
          const merged = [
            ...prev,
            ...converted.filter((img) => !existingIds.has(img.id)),
          ];
          return merged;
        });

        setHistoryOffset((prev) => prev + records.length);
        setHasMoreHistory(records.length === PAGE_SIZE);
      } catch (err) {
        console.error("[CoordinatePageContent] 追加履歴取得エラー:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    void fetchMoreHistory();
  }, [inView, isLoadingHistory, hasMoreHistory, historyOffset]);

  const handleGenerate = async (data: {
    prompt: string;
    sourceImage?: File;
    sourceImageStockId?: string;
    backgroundChange: boolean;
    count: number;
  }) => {
    setIsGenerating(true);
    setError(null);
    setGeneratingCount(data.count);
    setCompletedCount(0);

    try {
      const userId = await getCurrentUserId();

      let completed = 0;

      const result = await generateAndSaveImages({
        prompt: data.prompt,
        sourceImage: data.sourceImage,
        sourceImageStockId: data.sourceImageStockId,
        backgroundChange: data.backgroundChange,
        count: data.count,
        userId,
        onProgress: ({ record }) => {
          // 1枚生成・保存されるごとに進捗カウントを更新
          completed += 1;
          setCompletedCount(completed);

          // DBに保存された画像を履歴に即時反映
          if (record && record.id) {
            const image: GeneratedImageData = {
              id: record.id,
              url: record.image_url,
            };

            setHistoryImages((prev) => {
              const exists = prev.some((img) => img.id === image.id);
              if (exists) return prev;
              // 新しい画像を先頭に追加
              return [image, ...prev];
            });
          }
        },
      });
      // 念のため最終的な完了枚数で補正
      setCompletedCount(result.images.length);

      if (result.records.length === 0) {
        console.info(
          "✅ 画像生成成功！（開発モード: Supabase未設定のため保存はスキップされました）"
        );
      } else {
        // 新しく生成された画像を履歴にも反映（重複除去）
        setHistoryImages((prev) => {
          const existingIds = new Set(prev.map((img) => img.id));
          const newOnes = result.images.filter(
            (img) => !existingIds.has(img.id)
          );
          // 新しいものが先に来るように前に追加
          return [...newOnes, ...prev];
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の生成に失敗しました");
      console.error("Generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 生成フォーム */}
      <GenerationForm onSubmit={handleGenerate} isGenerating={isGenerating} />

      {/* エラー表示 */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {/* 生成結果 + 過去履歴 */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          生成結果一覧
        </h2>
        <GeneratedImageGallery
          images={historyImages}
          isGenerating={isGenerating}
          generatingCount={generatingCount}
          completedCount={completedCount}
        />

        {/* 無限スクロール用トリガー */}
        {hasMoreHistory && (
          <div ref={loadMoreRef} className="h-8 w-full" />
        )}
      </div>
    </div>
  );
}

