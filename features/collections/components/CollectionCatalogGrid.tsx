"use client";

import { useState } from "react";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import {
  CollectionProgressModal,
  type CollectionCelebration,
} from "@/features/collections/components/CollectionProgressModal";
import type {
  CollectionCatalogAvailability,
  CollectionCatalogEntry,
  CollectionCatalogState,
} from "@/features/collections/lib/collection-catalog-view";

/** generated-images(public バケット)の保存パスから公開URLを組み立てる(クライアント可)。 */
function buildMountUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/generated-images/${path}`;
}

function StateBadge({
  state,
  availability,
  remaining,
  threshold,
  locale,
}: {
  state: CollectionCatalogState;
  availability: CollectionCatalogAvailability;
  remaining: number;
  threshold: number;
  locale: "ja" | "en";
}) {
  if (state === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-white">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {locale === "en" ? "Complete" : "コンプ済み"}
      </span>
    );
  }
  if (availability === "ended") {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-bold text-gray-600">
        {locale === "en" ? "Ended" : "終了"}
      </span>
    );
  }
  if (availability === "upcoming") {
    return (
      <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
        {locale === "en" ? "Coming soon" : "近日"}
      </span>
    );
  }
  if (state === "in_progress") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
        {locale === "en" ? `${remaining} left` : `あと${remaining}種`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">
      {locale === "en" ? `${threshold} to collect` : `全${threshold}種`}
    </span>
  );
}

export function CollectionCatalogGrid({
  entries,
  locale,
}: {
  entries: CollectionCatalogEntry[];
  locale: "ja" | "en";
}) {
  const [celebration, setCelebration] = useState<CollectionCelebration | null>(
    null,
  );
  const [nonce, setNonce] = useState(0);

  if (entries.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-gray-500">
        {locale === "en"
          ? "No collections available yet. Check back soon!"
          : "いまは公開中のコレクションがありません。お楽しみに！"}
      </p>
    );
  }

  // コンプリート済みのカードをタップ → 完成台紙(コンプリート)モーダルを開く。
  function openCompleted(entry: CollectionCatalogEntry, name: string) {
    setNonce((n) => n + 1);
    setCelebration({
      categoryKey: entry.key,
      displayName: name,
      fromCount: entry.completionThreshold,
      toCount: entry.completionThreshold,
      threshold: entry.completionThreshold,
      isCompleted: true,
      mountImageUrl: buildMountUrl(entry.mountImagePath),
      mountTemplateWidth: entry.mountTemplateWidth,
      mountTemplateHeight: entry.mountTemplateHeight,
      sharePath: entry.completionId ? `/m/${entry.completionId}` : null,
      completionId: entry.completionId,
      characterImageUrl: null,
      collectedImageUrls: [],
      celebrationEffect: "sparkle",
    });
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {entries.map((entry) => {
          const name =
            locale === "en" ? entry.displayNameEn : entry.displayNameJa;
          const ratio =
            entry.completionThreshold > 0
              ? Math.min(1, entry.uniqueOutfitCount / entry.completionThreshold)
              : 0;
          // コンプリート者だけタップ可能(=モーダル)。それ以外はどこにも遷移しない。
          const isClickable = entry.state === "completed";
          const showProgressBar =
            entry.state === "in_progress" &&
            entry.availability === "available";
          const subLabel =
            entry.state === "completed"
              ? locale === "en"
                ? "Completed"
                : "コンプリート済み"
              : entry.availability === "ended"
                ? ""
                : entry.availability === "upcoming"
                  ? locale === "en"
                    ? "Coming soon"
                    : "近日公開"
                  : locale === "en"
                    ? `Collect all ${entry.completionThreshold}`
                    : `${entry.completionThreshold}種あつめよう`;

          const cardInner = (
            <>
              <div className="relative aspect-square bg-gray-100">
                {entry.imageUrl ? (
                  <Image
                    src={entry.imageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, 200px"
                    className="object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-3xl font-bold text-gray-300"
                    aria-hidden="true"
                  >
                    ?
                  </div>
                )}
                <div className="absolute left-1.5 top-1.5">
                  <StateBadge
                    state={entry.state}
                    availability={entry.availability}
                    remaining={entry.remaining}
                    threshold={entry.completionThreshold}
                    locale={locale}
                  />
                </div>
              </div>
              <div className="p-2.5">
                <p
                  className="truncate text-sm font-semibold text-gray-800"
                  title={name}
                >
                  {name}
                </p>
                {showProgressBar ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-gray-500">
                      {entry.uniqueOutfitCount}/{entry.completionThreshold}
                    </span>
                  </div>
                ) : subLabel ? (
                  <p className="mt-1 text-xs text-gray-400">{subLabel}</p>
                ) : null}
              </div>
            </>
          );

          return (
            <li key={entry.key}>
              {isClickable ? (
                <button
                  type="button"
                  onClick={() => openCompleted(entry, name)}
                  className="block w-full overflow-hidden rounded-2xl border border-gray-200 bg-white text-left transition-colors hover:bg-gray-50"
                  aria-label={`${name} のコンプリートカードを表示`}
                >
                  {cardInner}
                </button>
              ) : (
                <div className="block overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  {cardInner}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <CollectionProgressModal
        key={celebration ? `${celebration.categoryKey}-${nonce}` : "none"}
        open={!!celebration}
        celebration={celebration}
        onClose={() => setCelebration(null)}
      />
    </>
  );
}
