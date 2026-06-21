"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  CollectionProgressModal,
  type CollectionCelebration,
} from "@/features/collections/components/CollectionProgressModal";
import {
  CollectionMountComposer,
  type MountGeneratedResult,
} from "@/features/collections/components/CollectionMountComposer";
import type { CollectionProgress } from "@/features/collections/lib/collection-types";
import {
  buildMyPageCollectionSections,
  remainingOutfits,
} from "@/features/collections/lib/my-page-collection-sections";

/**
 * シールアルバム型のコレクションカード(マイページ)。
 * 集めた衣装サムネ + 未取得スロット(?) + 進捗バーで「集める」体験を表現する。
 * カード全体タップで進捗モーダルを開く(CTAボタンは持たない)。
 * highlighted=true(あと少し!)は桃色アクセント + 残り数バッジを付ける。
 */
function CollectionAlbumCard({
  series,
  highlighted,
  onOpen,
}: {
  series: CollectionProgress;
  highlighted: boolean;
  onOpen: () => void;
}) {
  const remaining = remainingOutfits(series);
  const filledImages = (series.collectedImageUrls ?? []).slice(
    0,
    series.uniqueOutfitCount,
  );
  // 収集済みだがサムネURLが取れなかった分(画像欠損)はチェック済みスロットで埋める。
  const filledNoImage = Math.max(
    0,
    series.uniqueOutfitCount - filledImages.length,
  );
  const ratio =
    series.completionThreshold > 0
      ? Math.min(1, series.uniqueOutfitCount / series.completionThreshold)
      : 0;
  const badgeLabel = remaining === 0 ? "コンプ！" : `あと${remaining}種`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-2xl border p-3 text-left transition-colors ${
        highlighted
          ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
          : "border-gray-200 bg-white hover:bg-gray-50"
      }`}
      aria-label={`${series.displayNameJa}(${series.uniqueOutfitCount}/${series.completionThreshold}種、${remaining === 0 ? "台紙を作れます" : `あと${remaining}種`})`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-gray-800">
          {series.displayNameJa}
        </p>
        {highlighted ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-white">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {badgeLabel}
          </span>
        ) : null}
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {filledImages.map((url, i) => (
          <span
            key={`f-${i}`}
            className="relative h-10 w-10 overflow-hidden rounded-lg border border-amber-200 bg-gray-100"
          >
            <Image src={url} alt="" fill sizes="40px" className="object-cover" />
          </span>
        ))}
        {Array.from({ length: filledNoImage }).map((_, i) => (
          <span
            key={`fn-${i}`}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-200 bg-amber-100 text-amber-500"
            aria-hidden="true"
          >
            <Check className="h-4 w-4" />
          </span>
        ))}
        {Array.from({ length: remaining }).map((_, i) => (
          <span
            key={`g-${i}`}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs font-bold text-gray-300"
            aria-hidden="true"
          >
            ?
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-amber-400"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-gray-500">
          {series.uniqueOutfitCount}/{series.completionThreshold} 種
        </span>
      </div>
    </button>
  );
}

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
      // サーバー側 cache(看板の完成数など)を反映するため再描画
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

      {/* あと少し!(残り0〜2着を最上段で後押し) */}
      {sections.almostDone.length > 0 ? (
        <section className="mt-2 space-y-2">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-amber-600">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            あと少し！
          </h3>
          {sections.almostDone.map((s) => (
            <CollectionAlbumCard
              key={s.categoryKey}
              series={s}
              highlighted
              onOpen={() => openSeriesModal(s)}
            />
          ))}
        </section>
      ) : null}

      {/* 進行中(達成間近順) */}
      {sections.inProgress.length > 0 ? (
        <section className="mt-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">進行中</h3>
          {sections.inProgress.map((s) => (
            <CollectionAlbumCard
              key={s.categoryKey}
              series={s}
              highlighted={false}
              onOpen={() => openSeriesModal(s)}
            />
          ))}
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
