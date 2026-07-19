"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/use-toast";

/**
 * Style プリセットのお気に入り(しおり)集合と楽観更新トグル。
 * /style (StylePageClient) とホームの探索シート (HomeStylePresetCarousel) で共有する。
 *
 * - トグルは楽観更新し、API 失敗時はロールバック+エラートースト
 * - ゲスト(未ログイン)はログイン誘導トーストのみ(集合は変更しない)
 */
export function useStyleFavorites({
  initialFavoritePresetIds,
  isAuthenticated,
}: {
  initialFavoritePresetIds?: readonly string[];
  isAuthenticated: boolean;
}) {
  const t = useTranslations("style");
  const { toast } = useToast();
  const [favoritePresetIds, setFavoritePresetIds] = useState<Set<string>>(
    () => new Set(initialFavoritePresetIds ?? []),
  );
  // プリセットごとの最新リクエスト番号。連打時に古いリクエストの失敗が
  // 後続操作の結果をロールバックしてしまわないよう、失敗処理は最新のみ有効にする。
  const latestRequestIdRef = useRef(new Map<string, number>());

  const toggleFavorite = async (presetId: string, next: boolean) => {
    if (!isAuthenticated) {
      toast({ title: t("styleFavoriteLoginRequired") });
      return;
    }
    setFavoritePresetIds((prev) => {
      const updated = new Set(prev);
      if (next) {
        updated.add(presetId);
      } else {
        updated.delete(presetId);
      }
      return updated;
    });
    // 楽観更新に合わせて即時に結果を通知する。API 失敗時は下の catch で
    // エラートーストに置き換わる(TOAST_LIMIT=1 のため同時表示にはならない)。
    toast({
      title: next ? t("styleFavoriteAdded") : t("styleFavoriteRemoved"),
    });
    const requestId = (latestRequestIdRef.current.get(presetId) ?? 0) + 1;
    latestRequestIdRef.current.set(presetId, requestId);
    try {
      const res = await fetch("/api/style-presets/favorites", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId }),
      });
      if (!res.ok) {
        throw new Error(`favorites api ${res.status}`);
      }
    } catch {
      // 古いリクエストの失敗なら何もしない(最新操作の楽観状態を壊さない)。
      if (latestRequestIdRef.current.get(presetId) !== requestId) {
        return;
      }
      // ロールバック(逆操作)。
      setFavoritePresetIds((prev) => {
        const updated = new Set(prev);
        if (next) {
          updated.delete(presetId);
        } else {
          updated.add(presetId);
        }
        return updated;
      });
      toast({ title: t("styleFavoriteError"), variant: "destructive" });
    }
  };

  return { favoritePresetIds, toggleFavorite };
}
