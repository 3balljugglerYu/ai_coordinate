"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { ImageModal } from "@/features/generation/components/ImageModal";
import {
  CollectionProgressModal,
  type CollectionCelebration,
} from "@/features/collections/components/CollectionProgressModal";
import { shareMount } from "@/features/collections/lib/share-mount";
import type { CollectionProgress } from "@/features/collections/lib/collection-types";

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
  const [progress, setProgress] = useState<CollectionProgress[]>([]);
  const [enlargeIndex, setEnlargeIndex] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<CollectionCelebration | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    fetch("/api/collections/progress", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: CollectionProgress[] }) => {
        if (active) setProgress(d.items ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
    setCelebration({
      categoryKey: series.categoryKey,
      displayName: series.displayNameJa,
      fromCount: series.uniqueOutfitCount,
      toCount: series.uniqueOutfitCount,
      threshold: series.completionThreshold,
      isCompleted: series.isCompleted,
      mountImageUrl: matched?.mountImageUrl ?? null,
      sharePath: matched ? `/m/${matched.completionId}` : null,
      completionId: matched?.completionId ?? null,
    });
  }

  return (
    <Card className="mt-4 p-4">
      <h2 className="mb-3 text-base font-semibold text-gray-900">コレクション</h2>

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
        <ul className="space-y-2">
          {progress.map((s) => {
            const ratio =
              s.completionThreshold > 0
                ? Math.min(1, s.uniqueOutfitCount / s.completionThreshold)
                : 0;
            return (
              <li key={s.categoryKey}>
                <button
                  type="button"
                  onClick={() => openSeriesModal(s)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-800">
                      {s.displayNameJa}
                    </span>
                    <span className="tabular-nums text-gray-500">
                      {s.uniqueOutfitCount} / {s.completionThreshold} 種
                      {s.isCompleted ? "（達成）" : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </div>
                </button>
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
        key={celebration ? celebration.categoryKey : "none"}
        open={!!celebration}
        celebration={celebration}
        onClose={() => setCelebration(null)}
        onShare={(c) => {
          if (c.completionId) {
            void shareMount(c.completionId).catch(() => {});
          }
        }}
      />
    </Card>
  );
}
