"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { getCurrentUserId } from "@/features/generation/lib/generation-service";
import { getGeneratedImages } from "@/features/generation/lib/database";

/**
 * 画像生成完了通知チェックコンポーネント
 * グローバルコンポーネントとして使用し、どの画面でも画像生成完了を通知します
 * StreakCheckerと同様の構造で実装
 */
export function GeneratedImageNotificationChecker() {
  const { toast } = useToast();

  useEffect(() => {
    // 初回マウント時は通知をスキップ（10秒後に初回チェックを開始）
    let isFirstCheck = true;

    const checkNewImages = async () => {
      // 認証チェック（未認証の場合は静かに終了）
      const userId = await getCurrentUserId();
      if (!userId) {
        return;
      }

      // 初回チェックはスキップ（既存画像への通知を防止）
      if (isFirstCheck) {
        isFirstCheck = false;
        return;
      }

      try {
        // sessionStorageから通知済み画像IDを取得
        const STORAGE_KEY = "notifiedGeneratedImageIds";
        const notifiedIds = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");

        // 最近作成された画像を取得（最大10件、coordinateタイプのみ）
        const allRecentImages = await getGeneratedImages(userId, 10, 0, "coordinate");

        // 直近5分以内に作成された画像をフィルタリング（クライアント側で処理）
        // 時刻のずれを考慮して5分30秒以内に設定
        const fiveMinutesThirtySecondsAgo = new Date(Date.now() - (5 * 60 + 30) * 1000);
        const recentImages = allRecentImages.filter((img) => {
          if (!img.created_at) return false;
          const createdAt = new Date(img.created_at);
          return createdAt >= fiveMinutesThirtySecondsAgo;
        });

        // 通知済みでない画像IDを抽出
        const newImageIds = recentImages
          .filter((img) => img.id && !notifiedIds.includes(img.id))
          .map((img) => img.id!)
          .filter((id): id is string => id !== null && id !== undefined);

        // 新規画像があればトースト通知
        if (newImageIds.length > 0) {
          toast({
            title: "新しい画像が生成されました",
            description:
              newImageIds.length === 1
                ? "画像が1枚追加されました"
                : `${newImageIds.length}枚の画像が追加されました`,
          });
          // sessionStorageに追加
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...notifiedIds, ...newImageIds]));
        }
      } catch (error) {
        // エラーが発生してもユーザー体験を損なわない（静かに失敗）
        // デバッグ用: 開発環境でのみエラーをログ出力
        if (process.env.NODE_ENV === "development") {
          console.error("[GeneratedImageNotificationChecker] Error:", error);
        }
      }
    };

    // 初回は10秒後に実行、以降は10秒ごとにポーリング
    const firstCheckTimeout = setTimeout(checkNewImages, 10000);
    const intervalId = setInterval(checkNewImages, 10000);

    // クリーンアップ関数（ポーリングの停止）
    return () => {
      clearTimeout(firstCheckTimeout);
      clearInterval(intervalId);
    };
  }, [toast]);

  // このコンポーネントはUIを表示しない
  return null;
}
