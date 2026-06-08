"use client";

import { CollectionProgressModal } from "@/features/collections/components/CollectionProgressModal";
import { useCollectionProgress } from "@/features/collections/hooks/useCollectionProgress";
import { shareMount } from "@/features/collections/lib/share-mount";

/**
 * 全画面共通のコレクション進捗チェッカー。AppShell にマウントし、
 * どの画面でもユニーク衣装数が増えた瞬間に進捗モーダルを発火する。
 * 未ログイン時は /api/collections/progress が空配列を返すため何も起きない。
 */
export function CollectionProgressChecker() {
  const { celebration, dismiss } = useCollectionProgress();
  return (
    <CollectionProgressModal
      // celebration ごとに再マウントしてバーのアニメーションを毎回 fromCount から開始
      key={celebration ? `${celebration.categoryKey}-${celebration.toCount}` : "none"}
      open={!!celebration}
      celebration={celebration}
      onClose={dismiss}
      onShare={(c) => {
        if (c.completionId) {
          void shareMount(c.completionId).catch(() => {
            // ユーザーキャンセル等は無視
          });
        }
      }}
    />
  );
}
