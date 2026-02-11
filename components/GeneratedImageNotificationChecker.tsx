"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { getCurrentUserId } from "@/features/generation/lib/generation-service";
import { getGeneratedImages } from "@/features/generation/lib/database";

const GENERATED_IMAGE_TOAST_HISTORY_STORAGE_KEY =
  "notified-generated-image-ids:v2";
const GENERATED_IMAGE_TOAST_HISTORY_LIMIT = 200;

function getGeneratedImageToastStorageKey(userId: string): string {
  return `${GENERATED_IMAGE_TOAST_HISTORY_STORAGE_KEY}:${userId}`;
}

function readGeneratedImageToastHistory(storageKey: string): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .slice(-GENERATED_IMAGE_TOAST_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeGeneratedImageToastHistory(
  storageKey: string,
  ids: Iterable<string>
): string[] {
  if (typeof window === "undefined") return [];

  const normalized = Array.from(new Set(ids))
    .filter((id) => typeof id === "string" && id.length > 0)
    .slice(-GENERATED_IMAGE_TOAST_HISTORY_LIMIT);

  try {
    sessionStorage.setItem(storageKey, JSON.stringify(normalized));
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[GeneratedImageNotificationChecker] Failed to persist history:",
        error
      );
    }
  }

  return normalized;
}

/**
 * 画像生成完了通知チェックコンポーネント
 * グローバルコンポーネントとして使用し、どの画面でも画像生成完了を通知します
 * StreakCheckerと同様の構造で実装
 */
export function GeneratedImageNotificationChecker() {
  const { toast } = useToast();

  useEffect(() => {
    let isChecking = false;
    let currentStorageKey: string | null = null;
    let notifiedIds = new Set<string>();
    let hasBaseline = false;

    const persistNotifiedIds = () => {
      if (!currentStorageKey) return;
      const normalized = writeGeneratedImageToastHistory(
        currentStorageKey,
        notifiedIds
      );
      notifiedIds = new Set(normalized);
    };

    const loadUserHistory = (userId: string) => {
      const nextStorageKey = getGeneratedImageToastStorageKey(userId);
      if (nextStorageKey === currentStorageKey) return;

      currentStorageKey = nextStorageKey;
      notifiedIds = new Set(readGeneratedImageToastHistory(nextStorageKey));
      hasBaseline = notifiedIds.size > 0;
    };

    const checkNewImages = async () => {
      if (isChecking) {
        return;
      }
      isChecking = true;

      // 認証チェック（未認証の場合は静かに終了）
      try {
        const userId = await getCurrentUserId();
        if (!userId) {
          currentStorageKey = null;
          notifiedIds = new Set();
          hasBaseline = false;
          return;
        }

        loadUserHistory(userId);

        // 最近作成された画像を取得（最大10件、coordinateタイプのみ）
        const recentImages = await getGeneratedImages(userId, 10, 0, "coordinate");
        const recentImageIds = recentImages
          .map((img) => img.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0);

        // 初回のみベースラインを確立して、既存画像への通知を防止
        if (!hasBaseline) {
          recentImageIds.forEach((id) => notifiedIds.add(id));
          hasBaseline = true;
          persistNotifiedIds();
          return;
        }

        // 通知済みでない画像IDを抽出
        const newImageIds = recentImageIds.filter((id) => !notifiedIds.has(id));

        // 新規画像があればトースト通知
        if (newImageIds.length > 0) {
          newImageIds.forEach((id) => notifiedIds.add(id));
          persistNotifiedIds();

          toast({
            title: "新しい画像が生成されました",
            description:
              newImageIds.length === 1
                ? "画像が1枚追加されました"
                : `${newImageIds.length}枚の画像が追加されました`,
          });
        }
      } catch (error) {
        // エラーが発生してもユーザー体験を損なわない（静かに失敗）
        // デバッグ用: 開発環境でのみエラーをログ出力
        if (process.env.NODE_ENV === "development") {
          console.error("[GeneratedImageNotificationChecker] Error:", error);
        }
      } finally {
        isChecking = false;
      }
    };

    // 初回マウント時にベースラインを確立し、その後10秒ごとにポーリング
    void checkNewImages();
    const intervalId = setInterval(() => {
      void checkNewImages();
    }, 10000);

    // クリーンアップ関数（ポーリングの停止）
    return () => {
      clearInterval(intervalId);
    };
  }, [toast]);

  // このコンポーネントはUIを表示しない
  return null;
}
