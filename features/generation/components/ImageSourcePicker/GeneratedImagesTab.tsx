"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PickerImageTile } from "./PickerImageTile";
import { PickerSkeleton } from "./PickerSkeleton";
import type { PickerSourceItem } from "../../types";

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
  const [items, setItems] = useState<GeneratedItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const fetchPage = useCallback(
    async (offset: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/generation-history/picker?limit=${PAGE_LIMIT}&offset=${offset}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as PickerApiResponse;
        setItems((prev) =>
          offset === 0 ? data.items : [...prev, ...data.items],
        );
        setNextOffset(data.nextOffset);
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

  useEffect(() => {
    if (!active || hasLoadedOnce) return;
    void fetchPage(0);
  }, [active, hasLoadedOnce, fetchPage]);

  // 初回 active 時、items が揃ったら最初のアイテムを親に通知 (1 回だけ)。
  const firstItemNotifiedRef = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (firstItemNotifiedRef.current) return;
    if (items.length === 0) return;
    firstItemNotifiedRef.current = true;
    onFirstItemReady?.(items[0]);
  }, [active, items, onFirstItemReady]);

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

      {nextOffset !== null ? (
        <div className="flex justify-center pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchPage(nextOffset)}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
