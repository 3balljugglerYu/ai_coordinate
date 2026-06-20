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
import {
  buildMyPageCollectionSections,
  remainingOutfits,
} from "@/features/collections/lib/my-page-collection-sections";

interface ComposerTarget {
  categoryKey: string;
  displayName: string;
  threshold: number;
}

/** 完成台紙アルバムで「もっと見る」前に表示する枚数。 */
const MOUNTS_PREVIEW_LIMIT = 6;

export interface CompletedMountView {
  completionId: string;
  categoryKey: string;
  displayName: string;
  mountImageUrl: string;
  mountTemplateWidth: number | null;
  mountTemplateHeight: number | null;
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
  const [showAllMounts, setShowAllMounts] = useState(false);
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
        mountTemplateWidth: result.mountTemplateWidth,
        mountTemplateHeight: result.mountTemplateHeight,
        characterImageUrl: null,
        collectedImageUrls: [],
      });
      void refreshProgress();
      // サーバー側 cache(完了台紙サムネ)を反映するため再描画
      router.refresh();
    },
    [composer, refreshProgress, router],
  );

  // 状態別セクション分け(未着手 0/N はここで除外される)。
  // 看板の数字は完成台紙(別ソース)のカテゴリと union して矛盾を防ぐ。
  const sections = buildMyPageCollectionSections(
    progress,
    completedMounts.map((m) => m.categoryKey),
  );
  // 完成台紙(server prop) も着手の一形態。いずれも無ければ非参加ユーザーなので丸ごと隠す。
  const hasAnything =
    completedMounts.length > 0 ||
    sections.hasEngagement ||
    sections.completedCount > 0;
  if (!hasAnything) {
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
      mountTemplateWidth: m.mountTemplateWidth,
      mountTemplateHeight: m.mountTemplateHeight,
      characterImageUrl: null,
      collectedImageUrls: [],
      canRecompose: cached?.canRecompose ?? false,
      // 完了済み台紙の見返しなので、紙吹雪ではなくダイヤのきらめき演出にする。
      celebrationEffect: "sparkle",
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
      mountTemplateWidth: series.mountTemplateWidth,
      mountTemplateHeight: series.mountTemplateHeight,
      characterImageUrl: series.characterImageUrl,
      collectedImageUrls: series.collectedImageUrls ?? [],
      // admin がカテゴリごとに設定した進捗モーダルの DB 駆動レイアウト。
      // これを渡さないと CollectionProgressModal が MODAL_LAYOUTS(ハードコード)に
      // フォールバックし、admin 設定のフレーム/スロット/中央画像が反映されない。
      progressModalFrameUrl: series.progressModalFrameUrl,
      progressModalFrameWidth: series.progressModalFrameWidth,
      progressModalFrameHeight: series.progressModalFrameHeight,
      progressModalSlots: series.progressModalSlots,
      progressModalButton: series.progressModalButton,
      progressModalCenter: series.progressModalCenter,
      progressModalRingColor: series.progressModalRingColor,
      progressModalBadgeColor: series.progressModalBadgeColor,
      progressModalBadgeTextColor: series.progressModalBadgeTextColor,
      progressModalBadgeBgColor: series.progressModalBadgeBgColor,
      progressModalButtonColor: series.progressModalButtonColor,
      progressModalButtonTextColor: series.progressModalButtonTextColor,
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

  const visibleMounts = showAllMounts
    ? completedMounts
    : completedMounts.slice(0, MOUNTS_PREVIEW_LIMIT);

  return (
    <Card className="mt-4 mb-6 gap-2 px-5 py-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-gray-900">コレクション</h2>
        {sections.totalSeries > 0 ? (
          <span className="text-xs text-gray-500">
            全{sections.totalSeries}中{" "}
            <span className="font-semibold text-amber-600">
              {sections.completedCount}
            </span>
            完成
          </span>
        ) : null}
      </div>

      {/* あと少し!(残り1〜2着を最上段で後押し) */}
      {sections.almostDone.length > 0 ? (
        <section className="mt-2 space-y-2">
          <h3 className="text-sm font-semibold text-amber-600">
            ✨ あと少し！
          </h3>
          {sections.almostDone.map((s) => {
            const remaining = remainingOutfits(s);
            // 全着収集済み(残り0)は台紙作成へ、それ以外は生成画面へ誘導。
            const readyToMount = remaining === 0;
            const filled = s.collectedImageUrls.slice(0, s.uniqueOutfitCount);
            const ghostCount = remaining; // 真の残り数(画像URL欠損に影響されない)
            const ctaLabel = readyToMount
              ? "コンプ！台紙を作る →"
              : `あと${remaining}着 着せる →`;
            const handleClick = readyToMount
              ? () => openSeriesModal(s)
              : () => router.push("/style");
            return (
              <button
                key={s.categoryKey}
                type="button"
                onClick={handleClick}
                className="flex w-full items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left hover:bg-amber-100"
                aria-label={
                  readyToMount
                    ? `${s.displayNameJa} の台紙を作る`
                    : `${s.displayNameJa} を続ける(あと${remaining}着)`
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-800">
                    {s.displayNameJa}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {filled.map((url, i) => (
                      <span
                        key={`f-${i}`}
                        className="relative h-6 w-6 overflow-hidden rounded-full border border-amber-300"
                      >
                        <Image
                          src={url}
                          alt=""
                          fill
                          sizes="24px"
                          className="object-cover"
                        />
                      </span>
                    ))}
                    {Array.from({ length: ghostCount }).map((_, i) => (
                      <span
                        key={`g-${i}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-amber-300 text-[10px] text-amber-400"
                        aria-hidden="true"
                      >
                        ?
                      </span>
                    ))}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white">
                  {ctaLabel}
                </span>
              </button>
            );
          })}
        </section>
      ) : null}

      {/* 進行中(達成間近順) */}
      {sections.inProgress.length > 0 ? (
        <section className="mt-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">進行中</h3>
          <ul className="space-y-3">
            {sections.inProgress.map((s) => {
              const ratio =
                s.completionThreshold > 0
                  ? Math.min(1, s.uniqueOutfitCount / s.completionThreshold)
                  : 0;
              return (
                <li key={s.categoryKey}>
                  <button
                    type="button"
                    onClick={() => openSeriesModal(s)}
                    className="flex w-full items-center gap-4 rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"
                  >
                    <CollectionProgressRing
                      ratio={ratio}
                      complete={false}
                      imageUrl={s.characterImageUrl}
                      tintByProgress={false}
                      color={s.progressModalRingColor}
                      className="w-16 shrink-0"
                    >
                      {!s.characterImageUrl ? (
                        <span className="text-sm font-bold tabular-nums text-gray-900">
                          {s.uniqueOutfitCount}/{s.completionThreshold}
                        </span>
                      ) : null}
                    </CollectionProgressRing>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-800">
                        {s.displayNameJa}
                      </p>
                      <p className="text-sm text-gray-500">
                        {s.uniqueOutfitCount} / {s.completionThreshold} 種
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* 完成した台紙(アルバム) */}
      {completedMounts.length > 0 ? (
        <section className="mt-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">完成した台紙</h3>
          <div className="flex flex-wrap gap-3">
            {visibleMounts.map((m) => (
              <button
                key={m.completionId}
                type="button"
                onClick={() => openMountModal(m)}
                className="relative w-24 overflow-hidden rounded-md border border-gray-200"
                style={{
                  aspectRatio: mountAspectForCategory(
                    m.categoryKey,
                    m.mountTemplateWidth,
                    m.mountTemplateHeight,
                  ),
                }}
                aria-label={`${m.displayName} のカードを表示`}
              >
                <Image
                  src={m.mountImageUrl}
                  alt={`${m.displayName} コンプリートカード`}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
          {completedMounts.length > MOUNTS_PREVIEW_LIMIT ? (
            <button
              type="button"
              onClick={() => setShowAllMounts((v) => !v)}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              {showAllMounts
                ? "▴ 閉じる"
                : `▸ もっと見る（${completedMounts.length}）`}
            </button>
          ) : null}
        </section>
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
