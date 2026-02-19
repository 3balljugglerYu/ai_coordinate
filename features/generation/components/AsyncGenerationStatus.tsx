"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { getGenerationStatus, pollGenerationStatus, type AsyncGenerationStatus } from "../lib/async-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AsyncGenerationStatusSkeleton } from "./AsyncGenerationStatusSkeleton";

/**
 * 非同期画像生成の進捗表示コンポーネント
 */
interface AsyncGenerationStatusProps {
  jobId: string;
  onComplete?: (status: AsyncGenerationStatus) => void;
  onError?: (error: Error) => void;
  pollingInterval?: number; // ポーリング間隔（ミリ秒、デフォルト: 2000）
}

export function AsyncGenerationStatus({
  jobId,
  onComplete,
  onError,
  pollingInterval = 2000,
}: AsyncGenerationStatusProps) {
  const [status, setStatus] = useState<AsyncGenerationStatus | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const stopPollingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let isMounted = true;

    const startPolling = async () => {
      try {
        // 初回ステータス取得
        const initialStatus = await getGenerationStatus(jobId);
        if (!isMounted) return;
        
        setStatus(initialStatus);
        setIsLoading(false);

        // 完了または失敗した場合は終了
        if (initialStatus.status === "succeeded" || initialStatus.status === "failed") {
          if (onComplete) {
            onComplete(initialStatus);
          }
          return;
        }

        // pollGenerationStatusを使用してポーリングを開始
        // タイムアウトとエラーハンドリングはpollGenerationStatus内で処理される
        const { promise, stop } = pollGenerationStatus(jobId, {
          interval: pollingInterval,
          timeout: 300000, // 5分でタイムアウト
          onStatusUpdate: (status) => {
            if (!isMounted) return;
            setStatus(status);
          },
        });

        // 停止関数を保存（クリーンアップ用）
        stopPollingRef.current = stop;

        // Promiseの解決または拒否を処理
        promise
          .then((finalStatus) => {
            if (!isMounted) return;
            setStatus(finalStatus);
            if (onComplete) {
              onComplete(finalStatus);
            }
          })
          .catch((err) => {
            if (!isMounted) return;
            // ポーリング停止によるエラーは無視（正常な動作）
            const errorMsg = err instanceof Error ? err.message : "";
            if (errorMsg === "ポーリングが停止されました") {
              return;
            }
            // その他のエラーのみ表示
            const error = err instanceof Error ? err : new Error("ステータスの取得に失敗しました");
            setError(error);
            setIsLoading(false);
            if (onError) {
              onError(error);
            }
          });
      } catch (err) {
        if (!isMounted) return;
        const error = err instanceof Error ? err : new Error("ステータスの取得に失敗しました");
        setError(error);
        setIsLoading(false);
        if (onError) {
          onError(error);
        }
        return undefined;
      }
    };

    startPolling();

    return () => {
      isMounted = false;
      if (stopPollingRef.current) {
        stopPollingRef.current();
        stopPollingRef.current = null;
      }
    };
  }, [jobId, pollingInterval, onComplete, onError]);

  if (isLoading) {
    return <AsyncGenerationStatusSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>エラー</CardTitle>
          <CardDescription>ステータスの取得に失敗しました</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-destructive">{error.message}</div>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return null;
  }

  const getStatusText = () => {
    switch (status.status) {
      case "queued":
        return "キュー待ち中";
      case "processing":
        return "生成処理中";
      case "succeeded":
        return "完了";
      case "failed":
        return "失敗";
      default:
        return "不明";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>画像生成ステータス</CardTitle>
        <CardDescription>{getStatusText()}</CardDescription>
      </CardHeader>
      <CardContent>
        {status.status === "succeeded" && status.resultImageUrl && (
          <div className="space-y-4">
            <div className="relative aspect-square w-full max-w-md mx-auto">
              <Image
                src={status.resultImageUrl}
                alt="生成された画像"
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>
        )}
        {status.status === "failed" && status.errorMessage && (
          <div className="text-sm text-destructive">{status.errorMessage}</div>
        )}
        {status.status === "processing" && (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">生成処理中...</div>
          </div>
        )}
        {status.status === "queued" && (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">キュー待ち中...</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
