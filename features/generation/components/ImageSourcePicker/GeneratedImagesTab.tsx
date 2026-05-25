"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PickerImageTile } from "./PickerImageTile";
import { PickerSkeleton } from "./PickerSkeleton";
import type { PickerSourceItem } from "../../types";
import {
  fetchGeneratedFirstPage,
  getCachedGeneratedFirstPage,
} from "../../lib/picker-cache";

type GeneratedItem = Extract<PickerSourceItem, { kind: "generated" }>;

interface PickerApiResponse {
  items: GeneratedItem[];
  nextOffset: number | null;
}

interface GeneratedImagesTabProps {
  /** 表示中のとき true。非表示時はネットワーク呼び出しを止める。 */
  active: boolean;
  /** ユーザー操作: 画像選択。 */
  onSelect: (item: GeneratedItem) => Promise<void> | void;
  /** 親が「fetch 中の id」を渡すと該当タイルにスピナーを出す。 */
  pendingItemId?: string | null;
  /** 親が「現在 preview 中の id」を渡すと該当タイルにチェックバッジを出す。 */
  selectedItemId?: string | null;
  /** disabled (例: 生成中)。 */
  disabled?: boolean;
  /**
   * 初回 active 時に items[0] が揃ったタイミングで 1 度だけ呼ばれる。
   * 親はこれを使って「ボトムシート表示時に先頭アイテムをデフォルト選択」
   * を実装できる。
   */
  onFirstItemReady?: (item: GeneratedItem) => void;
}

const PAGE_LIMIT = 50;

export function GeneratedImagesTab({
  active,
  onSelect,
  pendingItemId,
  selectedItemId = null,
  disabled = false,
  onFirstItemReady,
}: GeneratedImagesTabProps) {
  const t = useTranslations("imageSourcePicker");
  // mount 時点で cache があれば即時表示する。なければ通常通り fetch 待ち。
  const initialCache = useMemo(() => getCachedGeneratedFirstPage(), []);
  const [items, setItems] = useState<GeneratedItem[]>(
    initialCache?.items ?? [],
  );
  const [nextOffset, setNextOffset] = useState<number | null>(
    initialCache?.nextOffset ?? 0,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(initialCache !== null);

  const fetchPage = useCallback(
    async (offset: number) => {
      setIsLoading(true);
      setError(null);
      try {
        if (offset === 0) {
          // 先頭ページは cache モジュール経由 (in-flight dedup + キャッシュ書込)
          const data = await fetchGeneratedFirstPage(PAGE_LIMIT);
          setItems(data.items);
          setNextOffset(data.nextOffset);
        } else {
          const res = await fetch(
            `/api/generation-history/picker?limit=${PAGE_LIMIT}&offset=${offset}`,
            { cache: "no-store" },
          );
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data = (await res.json()) as PickerApiResponse;
          setItems((prev) => [...prev, ...data.items]);
          setNextOffset(data.nextOffset);
        }
      } catch (err) {
        console.error("[GeneratedImagesTab] fetch failed", err);
        setError(t("loadError"));
      } finally {
        setIsLoading(false);
        setHasLoadedOnce(true);
      }
    },
    [t],
  );

  // active 化時は必ず背景 revalidate を走らせる。cache がある場合は items
  // が既に表示されたまま、裏で fetch して差分を反映する (SWR-like)。
  useEffect(() => {
    if (!active) return;
    void fetchPage(0);
  }, [active, fetchPage]);

  // 初回 active 時、items が揃ったら最初のアイテムを親に通知 (1 回だけ)。
  const firstItemNotifiedRef = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (firstItemNotifiedRef.current) return;
    if (items.length === 0) return;
    firstItemNotifiedRef.current = true;
    onFirstItemReady?.(items[0]);
  }, [active, items, onFirstItemReady]);

  // infinite scroll: sentinel が viewport に入ったら次ページを fetch。
  // rootMargin: "200px" でスクロール末端の少し手前で発火させ、ユーザー
  // が完全に底に着く前に追加読み込みが間に合うようにする。
  // 注意: deps に isLoading を含めることで「読み込み中は observer を停止」
  // させ、同じ sentinel に対する多重 fire を防ぐ。
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (!active) return;
    if (nextOffset === null) return;
    if (isLoading) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          void fetchPage(nextOffset);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, nextOffset, isLoading, fetchPage]);

  const showEmpty = useMemo(
    () => hasLoadedOnce && !isLoading && items.length === 0 && !error,
    [hasLoadedOnce, isLoading, items.length, error],
  );

  if (!hasLoadedOnce && isLoading) {
    return <PickerSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-gray-700">{error}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void fetchPage(0)}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (showEmpty) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <PickerSkeleton count={3} />
        <p className="mt-2 text-sm font-medium text-gray-700">
          {t("emptyGeneratedTitle")}
        </p>
        <p className="text-xs text-gray-500">
          {t("emptyGeneratedDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
        {items.map((item) => (
          <PickerImageTile
            key={item.id}
            imageUrl={item.imageUrl}
            alt={item.generationType ?? "generated image"}
            onSelect={() => void onSelect(item)}
            loading={pendingItemId === item.id}
            selected={selectedItemId === item.id}
            disabled={disabled}
          />
        ))}
      </div>

      {/* infinite scroll sentinel: 画面下端 200px 手前で次ページを自動 fetch */}
      {nextOffset !== null ? (
        <div
          ref={sentinelRef}
          className="flex h-10 items-center justify-center pt-1"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
