"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GenerationForm } from "./GenerationForm";
import { getCurrentUserId } from "../lib/generation-service";
import {
  generateImageAsync,
  pollGenerationStatus,
  getInProgressJobs,
  getGenerationStatus,
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
  const pollingStopFunctionsRef = useRef<Set<() => void>>(new Set());

  // マウント時に未完了ジョブを確認してポーリングを再開
  useEffect(() => {
    const checkInProgressJobs = async () => {
      try {
        // 最近完了したジョブも含めて取得（直近5分以内）
        const jobs = await getInProgressJobs(true);
        
        // 未完了ジョブのみをフィルタリング
        const inProgressJobs = jobs.filter((job) => 
          job.status === "queued" || job.status === "processing"
        );
        
        // 完了済みジョブをフィルタリング
        const completedJobs = jobs.filter((job) => 
          job.status === "succeeded" || job.status === "failed"
        );
        
        if (inProgressJobs.length === 0 && completedJobs.length === 0) {
          // 未完了ジョブも最近完了したジョブもない場合は何もしない
          return;
        }
        
        // 未完了ジョブがある場合のみ、ポーリングを再開
        if (inProgressJobs.length > 0) {
          setIsGenerating(true);
          setGeneratingCount(inProgressJobs.length);
          setCompletedCount(completedJobs.length);
          setError(null);

          // 各未完了ジョブのステータスをポーリングで監視
          // まず、各ジョブの現在のステータスを確認してからポーリングを開始
          const pollPromises = inProgressJobs.map(async (job) => {
            // まず現在のステータスを確認
            let currentStatus: AsyncGenerationStatus;
            try {
              currentStatus = await getGenerationStatus(job.id);
              // すでに完了している場合は、ポーリングを開始しない
              if (currentStatus.status === "succeeded" || currentStatus.status === "failed") {
                if (currentStatus.status === "succeeded") {
                  setCompletedCount((prev) => prev + 1);
                } else {
                  setCompletedCount((prev) => prev + 1);
                  setError((prev) => {
                    const errorMsg = currentStatus.errorMessage || "画像生成に失敗しました";
                    return prev ? `${prev}; ${errorMsg}` : errorMsg;
                  });
                }
                // リフレッシュ
                if (refreshTimeoutRef.current) {
                  clearTimeout(refreshTimeoutRef.current);
                }
                refreshTimeoutRef.current = setTimeout(() => {
                  router.refresh();
                }, 500);
                return currentStatus;
              }
            } catch (err) {
              // ステータス取得に失敗した場合は、ポーリングを開始する（エラーは無視）
              console.error("Failed to get initial job status:", err);
            }

            // 未完了の場合のみ、ポーリングを開始
            const { promise, stop } = pollGenerationStatus(job.id, {
              interval: 2000, // 2秒ごとにポーリング
              timeout: 300000, // 5分でタイムアウト
              onStatusUpdate: (status: AsyncGenerationStatus) => {
                // ステータスが更新されたら、生成結果一覧を更新
                if (refreshTimeoutRef.current) {
                  clearTimeout(refreshTimeoutRef.current);
                }
                refreshTimeoutRef.current = setTimeout(() => {
                  router.refresh();
                }, 500);
              },
            });

            // 停止関数を保存（コンポーネントのクリーンアップ用）
            pollingStopFunctionsRef.current.add(stop);

            return promise
              .then((status) => {
                if (status.status === "succeeded") {
                  setCompletedCount((prev) => prev + 1);

                  // 生成結果一覧を更新
                  if (refreshTimeoutRef.current) {
                    clearTimeout(refreshTimeoutRef.current);
                  }
                  refreshTimeoutRef.current = setTimeout(() => {
                    router.refresh();
                  }, 500);
                } else if (status.status === "failed") {
                  setCompletedCount((prev) => prev + 1);
                  setError((prev) => {
                    const errorMsg = status.errorMessage || "画像生成に失敗しました";
                    return prev ? `${prev}; ${errorMsg}` : errorMsg;
                  });
                }
                return status;
              })
              .catch((err) => {
                // ポーリング停止によるエラーは無視（ユーザー操作による中断は正常）
                const errorMsg = err instanceof Error ? err.message : "";
                if (errorMsg === "ポーリングが停止されました") {
                  // ポーリング停止は正常な動作なので、エラーとして扱わない
                  setCompletedCount((prev) => prev + 1);
                  return { id: job.id, status: "queued" as const, resultImageUrl: null, errorMessage: null };
                }
                // その他のエラーのみ表示
                setCompletedCount((prev) => prev + 1);
                setError((prev) => {
                  const msg = errorMsg || "画像生成に失敗しました";
                  return prev ? `${prev}; ${msg}` : msg;
                });
                throw err;
              });
          });

        // すべてのジョブの完了を待つ
        const results = await Promise.allSettled(pollPromises);

        // 失敗したジョブがあるか確認（ポーリング停止によるエラーは除外）
        const failedJobs = results.filter((result) => {
          if (result.status === "rejected") {
            const errorMsg = result.reason?.message || "";
            // 「ポーリングが停止されました」は正常な動作なので、失敗として扱わない
            return errorMsg !== "ポーリングが停止されました";
          }
          return false;
        });
        
        if (failedJobs.length > 0 && failedJobs.length < inProgressJobs.length) {
          // 一部のジョブが失敗した場合
          setError((prev) => {
            const baseMsg = `一部の画像生成に失敗しました（${failedJobs.length}/${inProgressJobs.length}件）`;
            return prev ? `${prev}; ${baseMsg}` : baseMsg;
          });
        }

        // すべての未完了ジョブが完了したので、生成状態を解除
        setIsGenerating(false);

          // 最終的なリフレッシュ
          if (refreshTimeoutRef.current) {
            clearTimeout(refreshTimeoutRef.current);
            refreshTimeoutRef.current = null;
          }
          router.refresh();
        } else {
          // 未完了ジョブがなく、完了済みジョブのみがある場合
          // 状態をリセットして、表示をクリア
          setIsGenerating(false);
          setGeneratingCount(0);
          setCompletedCount(0);
        }
      } catch (err) {
        // エラーが発生した場合、エラーメッセージを設定して生成状態を解除
        console.error("Failed to check in-progress jobs:", err);
        setIsGenerating(false);
        setGeneratingCount(0);
        setCompletedCount(0);
      }
    };

    // マウント時に未完了ジョブを確認
    void checkInProgressJobs();
  }, [router]);

  // コンポーネントのアンマウント時にポーリングを停止
  useEffect(() => {
    return () => {
      // すべてのポーリングを停止
      pollingStopFunctionsRef.current.forEach((stop) => stop());
      pollingStopFunctionsRef.current.clear();
      // リフレッシュタイマーもクリア
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, []);

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

    // 既存のポーリングを停止
    pollingStopFunctionsRef.current.forEach((stop) => stop());
    pollingStopFunctionsRef.current.clear();

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
        } catch (err) {
          throw err;
        }
      }

      // 各ジョブのステータスをポーリングで監視
      const pollPromises = jobIds.map((jobId, index) => {
        const { promise, stop } = pollGenerationStatus(jobId, {
          interval: 2000, // 2秒ごとにポーリング
          timeout: 300000, // 5分でタイムアウト
          onStatusUpdate: (status: AsyncGenerationStatus) => {
            // ステータスが更新されたら、生成結果一覧を更新
            if (refreshTimeoutRef.current) {
              clearTimeout(refreshTimeoutRef.current);
            }
            refreshTimeoutRef.current = setTimeout(() => {
              router.refresh();
            }, 500);
          },
        });

        // 停止関数を保存（コンポーネントのクリーンアップ用）
        pollingStopFunctionsRef.current.add(stop);

        return promise
          .then((status) => {
            if (status.status === "succeeded") {
              completed += 1;
              setCompletedCount(completed);

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
              throw new Error(status.errorMessage || "画像生成に失敗しました");
            }
            return status;
          })
          .catch((err) => {
            completed += 1;
            setCompletedCount(completed);
            throw err;
          });
      });

      // すべてのジョブの完了を待つ
      const results = await Promise.allSettled(pollPromises);

      // 失敗したジョブがあるか確認（ポーリング停止によるエラーは除外）
      const failedJobs = results.filter((result) => {
        if (result.status === "rejected") {
          const errorMsg = result.reason?.message || "";
          // 「ポーリングが停止されました」は正常な動作なので、失敗として扱わない
          return errorMsg !== "ポーリングが停止されました";
        }
        return false;
      });
      
      if (failedJobs.length > 0) {
        const errorMessages = failedJobs
          .map((result) => result.status === "rejected" ? result.reason?.message || "不明なエラー" : null)
          .filter((msg): msg is string => msg !== null);
        
        if (failedJobs.length === jobIds.length) {
          // すべてのジョブが失敗した場合
          throw new Error(`すべてのジョブが失敗しました: ${errorMessages.join(", ")}`);
        } else {
          // 一部のジョブが失敗した場合
          setError(`一部の画像生成に失敗しました（${failedJobs.length}/${jobIds.length}件）`);
        }
      }

      // 最終的なリフレッシュ
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の生成に失敗しました");
    } finally {
      setIsGenerating(false);
      // ポーリングを停止
      pollingStopFunctionsRef.current.forEach((stop) => stop());
      pollingStopFunctionsRef.current.clear();
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
