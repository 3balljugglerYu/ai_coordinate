"use client";

import { CollectionProgressModal } from "@/features/collections/components/CollectionProgressModal";
import { CollectionMountComposer } from "@/features/collections/components/CollectionMountComposer";
import { useCollectionProgress } from "@/features/collections/hooks/useCollectionProgress";

/**
 * 全画面共通のコレクション進捗チェッカー。AppShell にマウントし、
 * どの画面でもユニーク衣装数が増えた瞬間に進捗モーダル/台紙コンポーザを発火する。
 * 未ログイン時は /api/collections/progress が空配列を返すため何も起きない。
 */
export function CollectionProgressChecker() {
  const {
    celebration,
    dismiss,
    composer,
    closeComposer,
    onComposerGenerated,
    openComposerFromCelebration,
  } = useCollectionProgress();
  return (
    <>
      <CollectionProgressModal
        key={
          celebration
            ? `${celebration.categoryKey}-${celebration.toCount}`
            : "none"
        }
        open={!!celebration}
        celebration={celebration}
        onClose={dismiss}
        onCreateMount={openComposerFromCelebration}
      />
      {composer ? (
        <CollectionMountComposer
          key={composer.categoryKey}
          categoryKey={composer.categoryKey}
          displayName={composer.displayName}
          threshold={composer.threshold}
          onClose={closeComposer}
          onGenerated={onComposerGenerated}
        />
      ) : null}
    </>
  );
}
