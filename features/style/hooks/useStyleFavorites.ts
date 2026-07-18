"use client";

import { useState } from "react";
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
