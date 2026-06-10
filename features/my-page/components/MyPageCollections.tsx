"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  CollectionProgressModal,
  type CollectionCelebration,
} from "@/features/collections/components/CollectionProgressModal";
import {
  CollectionMountComposer,
  type MountGeneratedResult,
} from "@/features/collections/components/CollectionMountComposer";
import { CollectionProgressRing } from "@/features/collections/components/CollectionProgressRing";
import { mountAspectForCategory } from "@/features/collections/lib/mount-aspects";
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
 * - 完了済み台紙のサムネ(タップで CollectionProgressModal の完了ビュー = 台紙+シェア)
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
  const [celebration, setCelebration] = useState<CollectionCelebration | null>(
    null,
  );
  // タップのたびにモーダルを再マウントしてバーを 0 から再アニメさせるための nonce
  const [celebrationNonce, setCelebrationNonce] = useState(0);
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  // 「台紙を更新する」の表示可否と threshold のカテゴリ別キャッシュ。
  // マウント時に先読みし、サムネクリック時は即時反映する。
  const [recomposeInfo, setRecomposeInfo] = useState<
    Record<string, { threshold: number; canRecompose: boolean }>
  >({});

  const loadRecomposeInfo = useCallback(async (categoryKey: string) => {
    try {
      const r = await fetch(
        `/api/collections/options?categoryKey=${encodeURIComponent(categoryKey)}`,
        { cache: "no-store" },
      );
      if (!r.ok) return null;
      const d = (await r.json()) as {
        threshold?: number | null;
        outfits?: { images: unknown[] }[];
      };
      const outfits = d.outfits ?? [];
      const threshold = d.threshold ?? 0;
      const info = {
        threshold,
        canRecompose:
          threshold > 0 &&
          outfits.length >= threshold &&
          outfits.some((o) => o.images.length > 1),
      };
      setRecomposeInfo((prev) => ({ ...prev, [categoryKey]: info }));
      return info;
    } catch {
      return null;
    }
  }, []);

  // 完了サムネのカテゴリぶんを先読み(数件想定)。失敗してもシェア等には影響しない。
  useEffect(() => {
    const keys = [...new Set(completedMounts.map((m) => m.categoryKey))];
    void (async () => {
      await Promise.all(keys.map((key) => loadRecomposeInfo(key)));
    })();
  }, [completedMounts, loadRecomposeInfo]);

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

  const handleGenerated = useCallback(
    (result: MountGeneratedResult) => {
      const target = composer;
      setComposer(null);
      // 生成成功 → 完了モーダル(台紙サムネ + シェア)を表示
      setCelebrationNonce((n) => n + 1);
      setCelebration({
        categoryKey: result.categoryKey,
        displayName: target?.displayName ?? "",
        // 0 アニメは不要(既に完成)。toCount=threshold で 100% 表示。
        fromCount: target?.threshold ?? 0,
        toCount: target?.threshold ?? 0,
        threshold: target?.threshold ?? 0,
        isCompleted: true,
        mountImageUrl: result.mountImageUrl,
        sharePath: result.sharePath,
        completionId: result.completionId,
        characterImageUrl: null,
        collectedImageUrls: [],
      });
      void refreshProgress();
      // サーバー側 cache(完了台紙サムネ)を反映するため再描画
      router.refresh();
    },
    [composer, refreshProgress, router],
  );

  if (completedMounts.length === 0 && progress.length === 0) {
    return null;
  }

  /**
   * サムネクリックで「台紙 + シェアボタン」のモーダル(完了モード)を表示。
   * 拡大表示と兼ねるため CollectionProgressModal の完了ビューを再利用する。
   * 「台紙を更新する」(canRecompose) と threshold は先読みキャッシュから即時反映し、
   * 未取得ならフォールバックで取得して反映する
   * (進捗カードが非表示でも完了サムネから台紙を更新できるようにするため)。
   */
  function openMountModal(m: CompletedMountView) {
    const cached = recomposeInfo[m.categoryKey];
    setCelebrationNonce((n) => n + 1);
    setCelebration({
      categoryKey: m.categoryKey,
      displayName: m.displayName,
      fromCount: 0,
      toCount: 0,
      threshold: cached?.threshold ?? 0,
      isCompleted: true,
      mountImageUrl: m.mountImageUrl,
      sharePath: `/m/${m.completionId}`,
      completionId: m.completionId,
      characterImageUrl: null,
      collectedImageUrls: [],
      canRecompose: cached?.canRecompose ?? false,
    });
    if (!cached) {
      void loadRecomposeInfo(m.categoryKey).then((info) => {
        if (!info) return;
        setCelebration((prev) =>
          prev && prev.completionId === m.completionId
            ? {
                ...prev,
                threshold: info.threshold,
                canRecompose: info.canRecompose,
              }
            : prev,
        );
      });
    }
  }

  function openSeriesModal(series: CollectionProgress) {
    setCelebrationNonce((n) => n + 1);
    // マイページタップでは「進捗モーダル(0→現在値アニメ + ボタン)」を見せたいので、
    // 完了済みでも mountImageUrl は渡さない(= showMount=false で進捗ビューになる)。
    // 「作成 or 更新」の判定はモーダル側で isCompleted を見て切替。
    setCelebration({
      categoryKey: series.categoryKey,
      displayName: series.displayNameJa,
      fromCount: 0,
      toCount: series.uniqueOutfitCount,
      threshold: series.completionThreshold,
      isCompleted: series.isCompleted,
      mountImageUrl: null,
      sharePath: null,
      completionId: null,
      characterImageUrl: series.characterImageUrl,
      collectedImageUrls: series.collectedImageUrls ?? [],
    });
  }

  /**
   * モーダル内「台紙を作成する／更新する」CTA 押下時。
   * モーダルを閉じてから composer (画像選択) を開く。
   */
  function openComposerFromCelebration(c: CollectionCelebration) {
    setCelebration(null);
    setComposer({
      categoryKey: c.categoryKey,
      displayName: c.displayName,
      threshold: c.threshold,
    });
  }

  return (
    <Card className="mt-4 mb-6 gap-2 px-5 py-3">
      <h2 className="text-base font-semibold text-gray-900">コレクション</h2>

      {completedMounts.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-3">
          {completedMounts.map((m) => (
            <button
              key={m.completionId}
              type="button"
              onClick={() => openMountModal(m)}
              className="relative w-24 overflow-hidden rounded-md border border-gray-200"
              style={{ aspectRatio: mountAspectForCategory(m.categoryKey) }}
              aria-label={`${m.displayName} の台紙を表示`}
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
                {/* 台紙作成・更新はモーダル内 CTA に集約(行下のボタンは廃止) */}
              </li>
            );
          })}
        </ul>
      ) : null}

      <CollectionProgressModal
        key={celebration ? `${celebration.categoryKey}-${celebrationNonce}` : "none"}
        open={!!celebration}
        celebration={celebration}
        onClose={() => setCelebration(null)}
        onCreateMount={openComposerFromCelebration}
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
