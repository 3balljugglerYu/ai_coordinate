"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { GenerationForm } from "./GenerationForm";
import {
  generateAndSaveImages,
  getCurrentUserId,
} from "../lib/generation-service";
import type { SourceImageStock } from "../lib/database";

interface GenerationFormContainerProps {}

/**
 * クライアントコンポーネント: GenerationFormとその状態管理
 * Suspenseの外に配置して即座に表示される
 */
export function GenerationFormContainer({}: GenerationFormContainerProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingCount, setGeneratingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
        onProgress: (payload) => {
          // 1枚生成・保存されるごとに進捗カウントを更新
          completed += 1;
          setCompletedCount(completed);

          // 画像が保存された場合（recordが存在する場合）、生成結果一覧を更新
          if (payload.record) {
            // デバウンス: 前回のリフレッシュから300ms経過後に実行
            if (refreshTimeoutRef.current) {
              clearTimeout(refreshTimeoutRef.current);
            }
            refreshTimeoutRef.current = setTimeout(() => {
              router.refresh();
            }, 300);
          }
        },
      });
      // 念のため最終的な完了枚数で補正
      setCompletedCount(result.images.length);

      if (result.records.length === 0) {
        console.info(
          "✅ 画像生成成功！（開発モード: Supabase未設定のため保存はスキップされました）"
        );
      }
      
      // 生成完了後、最後のリフレッシュを確実に実行
      // デバウンスタイマーが残っている場合はクリアして即座に実行
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      if (result.records.length > 0) {
        router.refresh();
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

      {/* 生成中表示 */}
      {isGenerating && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                画像を生成中...
              </p>
              <p className="text-xs text-blue-700">
                {completedCount} / {generatingCount} 枚完了
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
