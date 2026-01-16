"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { GenerationForm } from "./GenerationForm";
import { getCurrentUserId } from "../lib/generation-service";
import {
  generateImageAsync,
  pollGenerationStatus,
  type AsyncGenerationStatus,
} from "../lib/async-api";

interface GenerationFormContainerProps {}

/**
 * クライアントコンポーネント: GenerationFormとその状態管理
 * Suspenseの外に配置して即座に表示される
 * 非同期画像生成APIを使用
 */
export function GenerationFormContainer({}: GenerationFormContainerProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingCount, setGeneratingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  const handleGenerate = async (data: {
    prompt: string;
    sourceImage?: File;
    sourceImageStockId?: string;
    backgroundChange: boolean;
    count: number;
    model: import("../types").GeminiModel;
    generationType?: import("../types").GenerationType;
  }) => {
    setIsGenerating(true);
    setError(null);
    setGeneratingCount(data.count);
    setCompletedCount(0);

    // 既存のポーリングをクリア
    pollingIntervalsRef.current.forEach((interval) => clearTimeout(interval));
    pollingIntervalsRef.current.clear();

    try {
      const userId = await getCurrentUserId();
      const jobIds: string[] = [];
      let completed = 0;

      // 複数枚生成する場合は、それぞれジョブを投入
      for (let i = 0; i < data.count; i++) {
        try {
          const response = await generateImageAsync({
            prompt: data.prompt,
            sourceImage: data.sourceImage,
            sourceImageStockId: data.sourceImageStockId,
            backgroundChange: data.backgroundChange,
            generationType: data.generationType || "coordinate",
            model: data.model,
          });

          jobIds.push(response.jobId);
          console.log(`ジョブ ${i + 1}/${data.count} を投入しました:`, response.jobId);
        } catch (err) {
          console.error(`ジョブ ${i + 1} の投入に失敗:`, err);
          throw err;
        }
      }

      // 各ジョブのステータスをポーリングで監視
      const pollPromises = jobIds.map((jobId, index) => {
        return pollGenerationStatus(jobId, {
          interval: 2000, // 2秒ごとにポーリング
          timeout: 300000, // 5分でタイムアウト
          onStatusUpdate: (status: AsyncGenerationStatus) => {
            console.log(`ジョブ ${index + 1} のステータス更新:`, status.status);
            
            // ステータスが更新されたら、生成結果一覧を更新
            if (refreshTimeoutRef.current) {
              clearTimeout(refreshTimeoutRef.current);
            }
            refreshTimeoutRef.current = setTimeout(() => {
              router.refresh();
            }, 500);
          },
        })
          .then((status) => {
            if (status.status === "succeeded") {
              completed += 1;
              setCompletedCount(completed);
              console.log(`ジョブ ${index + 1} が完了しました`);

              // 生成結果一覧を更新
              if (refreshTimeoutRef.current) {
                clearTimeout(refreshTimeoutRef.current);
              }
              refreshTimeoutRef.current = setTimeout(() => {
                router.refresh();
              }, 500);
            } else if (status.status === "failed") {
              completed += 1;
              setCompletedCount(completed);
              console.error(`ジョブ ${index + 1} が失敗しました:`, status.errorMessage);
              throw new Error(status.errorMessage || "画像生成に失敗しました");
            }
            return status;
          })
          .catch((err) => {
            completed += 1;
            setCompletedCount(completed);
            console.error(`ジョブ ${index + 1} の監視中にエラー:`, err);
            throw err;
          });
      });

      // すべてのジョブの完了を待つ
      const results = await Promise.allSettled(pollPromises);

      // 失敗したジョブがあるか確認
      const failedJobs = results.filter((result) => result.status === "rejected");
      if (failedJobs.length > 0) {
        const errorMessages = failedJobs
          .map((result) => result.status === "rejected" ? result.reason?.message || "不明なエラー" : null)
          .filter((msg): msg is string => msg !== null);
        
        if (failedJobs.length === jobIds.length) {
          // すべてのジョブが失敗した場合
          throw new Error(`すべてのジョブが失敗しました: ${errorMessages.join(", ")}`);
        } else {
          // 一部のジョブが失敗した場合
          console.warn(`一部のジョブが失敗しました: ${errorMessages.join(", ")}`);
          setError(`一部の画像生成に失敗しました（${failedJobs.length}/${jobIds.length}件）`);
        }
      }

      // 最終的なリフレッシュ
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      router.refresh();

      console.log("✅ すべてのジョブが完了しました");
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の生成に失敗しました");
      console.error("Generation error:", err);
    } finally {
      setIsGenerating(false);
      // ポーリングをクリア
      pollingIntervalsRef.current.forEach((interval) => clearTimeout(interval));
      pollingIntervalsRef.current.clear();
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
