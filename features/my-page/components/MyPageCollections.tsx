"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { ImageModal } from "@/features/generation/components/ImageModal";
import {
  CollectionProgressModal,
  type CollectionCelebration,
} from "@/features/collections/components/CollectionProgressModal";
import { CollectionMountComposer } from "@/features/collections/components/CollectionMountComposer";
import { CollectionProgressRing } from "@/features/collections/components/CollectionProgressRing";
import { shareMount } from "@/features/collections/lib/share-mount";
import type { CollectionProgress } from "@/features/collections/lib/collection-types";

interface ComposerTarget {
  categoryKey: string;
  displayName: string;
  threshold: number;
}

export interface CompletedMountView {
  completionId: string;
  categoryKey: string;
  displayName: string;
  mountImageUrl: string;
}

/**
 * マイページのコレクション表示。
 * - 完了済み台紙のサムネ(タップで拡大モーダル=コンテンツ詳細と同じ ImageModal)
 * - 進捗一覧(ライブ取得。行タップで進捗モーダル)
 * 完了サムネはサーバー(cache)から props で受け取り、進捗はクライアントで取得する。
 */
export function MyPageCollections({
  completedMounts,
}: {
  completedMounts: CompletedMountView[];
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<CollectionProgress[]>([]);
  const [enlargeIndex, setEnlargeIndex] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<CollectionCelebration | null>(
    null,
  );
  // タップのたびにモーダルを再マウントしてバーを 0 から再アニメさせるための nonce
  const [celebrationNonce, setCelebrationNonce] = useState(0);
  const [composer, setComposer] = useState<ComposerTarget | null>(null);

  const refreshProgress = useCallback(async () => {
    try {
      const r = await fetch("/api/collections/progress", { cache: "no-store" });
      const d = (r.ok ? await r.json() : { items: [] }) as {
        items?: CollectionProgress[];
      };
      setProgress(d.items ?? []);
    } catch {
      // 取得失敗は無視
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const r = await fetch("/api/collections/progress", {
          cache: "no-store",
        });
        const d = (r.ok ? await r.json() : { items: [] }) as {
          items?: CollectionProgress[];
        };
        if (active) setProgress(d.items ?? []);
      } catch {
        // 取得失敗は無視
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleGenerated = useCallback(() => {
    setComposer(null);
    void refreshProgress();
    // サーバー側 cache(完了台紙サムネ)を反映するため再描画
    router.refresh();
  }, [refreshProgress, router]);

  if (completedMounts.length === 0 && progress.length === 0) {
    return null;
  }

  const enlargeImages = completedMounts.map((m) => ({
    id: m.completionId,
    url: m.mountImageUrl,
    is_posted: false,
  }));

  function openSeriesModal(series: CollectionProgress) {
    const matched = completedMounts.find(
      (m) => m.categoryKey === series.categoryKey,
    );
    setCelebrationNonce((n) => n + 1);
    setCelebration({
      categoryKey: series.categoryKey,
      displayName: series.displayNameJa,
      // マイページからのタップでも 0→現在値 でバーをアニメーションさせる
      fromCount: 0,
      toCount: series.uniqueOutfitCount,
      threshold: series.completionThreshold,
      isCompleted: series.isCompleted,
      mountImageUrl: matched?.mountImageUrl ?? null,
      sharePath: matched ? `/m/${matched.completionId}` : null,
      completionId: matched?.completionId ?? null,
      characterImageUrl: series.characterImageUrl,
      collectedImageUrls: series.collectedImageUrls ?? [],
    });
  }

  return (
    <Card className="mt-4 mb-6 px-5 py-3">
      <h2 className="mb-1 text-base font-semibold text-gray-900">コレクション</h2>

      {completedMounts.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-3">
          {completedMounts.map((m, i) => (
            <button
              key={m.completionId}
              type="button"
              onClick={() => setEnlargeIndex(i)}
              className="relative aspect-[525/612] w-24 overflow-hidden rounded-md border border-gray-200"
              aria-label={`${m.displayName} の台紙を拡大`}
            >
              <Image
                src={m.mountImageUrl}
                alt={`${m.displayName} コンプリート台紙`}
                fill
                sizes="96px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {progress.length > 0 ? (
        <ul className="space-y-3">
          {progress.map((s) => {
            const ratio =
              s.completionThreshold > 0
                ? Math.min(1, s.uniqueOutfitCount / s.completionThreshold)
                : 0;
            const completed = s.uniqueOutfitCount >= s.completionThreshold;
            const eligibleNotCompleted = completed && !s.isCompleted;
            return (
              <li key={s.categoryKey}>
                <button
                  type="button"
                  onClick={() => openSeriesModal(s)}
                  className="flex w-full items-center gap-4 rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"
                >
                  <CollectionProgressRing
                    ratio={ratio}
                    complete={completed}
                    imageUrl={s.characterImageUrl}
                    tintByProgress={false}
                    className="w-16 shrink-0"
                  >
                    {!s.characterImageUrl ? (
                      completed ? (
                        <span className="text-xs font-bold text-amber-500">
                          完成
                        </span>
                      ) : (
                        <span className="text-sm font-bold tabular-nums text-gray-900">
                          {s.uniqueOutfitCount}/{s.completionThreshold}
                        </span>
                      )
                    ) : null}
                  </CollectionProgressRing>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-800">
                      {s.displayNameJa}
                    </p>
                    <p className="text-sm text-gray-500">
                      {s.uniqueOutfitCount} / {s.completionThreshold} 種
                      {s.isCompleted ? "（達成）" : ""}
                    </p>
                  </div>
                </button>
                {eligibleNotCompleted ? (
                  <button
                    type="button"
                    onClick={() =>
                      setComposer({
                        categoryKey: s.categoryKey,
                        displayName: s.displayNameJa,
                        threshold: s.completionThreshold,
                      })
                    }
                    className="mt-2 w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    台紙を作る
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {enlargeIndex !== null && enlargeImages[enlargeIndex] ? (
        <ImageModal
          images={enlargeImages}
          initialIndex={enlargeIndex}
          onClose={() => setEnlargeIndex(null)}
          disablePostAndDownload
        />
      ) : null}

      <CollectionProgressModal
        key={celebration ? `${celebration.categoryKey}-${celebrationNonce}` : "none"}
        open={!!celebration}
        celebration={celebration}
        onClose={() => setCelebration(null)}
        onShare={(c) => {
          if (c.completionId) {
            void shareMount(c.completionId).catch(() => {});
          }
        }}
      />

      {composer ? (
        <CollectionMountComposer
          key={composer.categoryKey}
          categoryKey={composer.categoryKey}
          displayName={composer.displayName}
          threshold={composer.threshold}
          onClose={() => setComposer(null)}
          onGenerated={handleGenerated}
        />
      ) : null}
    </Card>
  );
}
