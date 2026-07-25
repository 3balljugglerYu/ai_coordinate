"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { PublicStyleCard } from "@/features/style-presets/components/PublicStyleCard";
import { StyleTryOnConfirmDialog } from "@/features/style-presets/components/StyleTryOnConfirmDialog";
import {
  deriveStyleBrowseChips,
  filterStyleBrowsePresets,
  STYLE_NEW_WINDOW_DAYS,
  type StyleBrowseChipId,
} from "@/features/style/lib/style-browse-filter";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import { localizePublicPath, type Locale } from "@/i18n/config";

/** チップ先頭の絵文字(装飾)。探索シート(StyleBrowseSheet)と同じ見た目に揃える。 */
const CHIP_EMOJI: Partial<Record<string, string>> = {
  event: "🎉",
  favorites: "🔖",
  new: "✨",
  popular: "👑",
  creator: "🤝",
};

interface StylesGalleryClientProps {
  presets: StylePresetPublicSummary[];
  /** プリセットID -> 直近生成数(👑人気チップの表示判定と並び替え)。 */
  generateCounts: Record<string, number>;
  /**
   * 「✨新着」「🎉イベント」判定の基準時刻(ISO)。
   * サーバー("use cache" スコープ)で確定した値を受け取ることで、
   * SSR とハイドレーションでチップ構成が一致する。
   */
  nowIso: string;
  locale: Locale;
}

/**
 * /styles のチップフィルター付きギャラリー。
 * 絞り込みロジックは /style の探索シートと同じ純関数
 * (deriveStyleBrowseChips / filterStyleBrowsePresets)を再利用する。
 *
 * SEO 上の要点: 初期状態(すべて)では全カードが SSR で HTML に含まれる。
 * チップはクライアント側の絞り込み表示であり、クローラーは常に全件を見る。
 * お気に入り(🔖)などのユーザー状態は静的プリレンダを壊さないよう、
 * マウント後にブラウザ側で取得する。
 */
export function StylesGalleryClient({
  presets,
  generateCounts,
  nowIso,
  locale,
}: StylesGalleryClientProps) {
  const t = useTranslations("style");
  const router = useRouter();
  const [activeChip, setActiveChip] = useState<StyleBrowseChipId>("all");
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // カードタップは即遷移せず、ホームのカルーセルと同じ「試着しますか？」確認を挟む。
  // 紹介ページ(/styles/[slug])へは href(修飾キー付きクリック/クローラー)で辿れる。
  const [confirmingPreset, setConfirmingPreset] =
    useState<StylePresetPublicSummary | null>(null);

  const handleConfirm = () => {
    const preset = confirmingPreset;
    if (!preset) {
      return;
    }
    setConfirmingPreset(null);
    router.push(
      `${localizePublicPath("/style", locale)}?style=${encodeURIComponent(preset.id)}`
    );
  };

  // ログイン済みならお気に入り(しおり)を取得して 🔖 チップを有効化する。
  // 未ログイン・取得失敗時はチップが出ないだけで、一覧表示には影響しない。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled || !user) {
          return;
        }
        setIsAuthenticated(true);
        const { data } = await supabase
          .from("style_preset_favorites")
          .select("preset_id");
        if (cancelled) {
          return;
        }
        setFavoriteIds(
          new Set(
            (data ?? [])
              .map((row) => row.preset_id as string)
              .filter(Boolean)
          )
        );
      } catch {
        // 認証状態の取得に失敗してもゲスト表示として成立する
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const context = useMemo(
    () => ({
      favoriteIds,
      generateCounts,
      now: new Date(nowIso),
      isAuthenticated,
    }),
    [favoriteIds, generateCounts, nowIso, isAuthenticated]
  );
  const chips = useMemo(
    () => deriveStyleBrowseChips(presets, context),
    [presets, context]
  );
  const filtered = useMemo(
    () => filterStyleBrowsePresets(presets, activeChip, context),
    [presets, activeChip, context]
  );

  function chipLabel(chip: (typeof chips)[number]): string {
    if (chip.id.startsWith("category:")) {
      return (
        (locale === "ja" ? chip.categoryLabelJa : chip.categoryLabelEn) ??
        chip.id
      );
    }
    switch (chip.id) {
      case "all":
        return t("styleChipAll");
      case "event":
        return t("styleChipEvent");
      case "favorites":
        return t("styleChipFavorites");
      case "new":
        return t("styleChipNew");
      case "popular":
        return t("styleChipPopular");
      case "creator":
        return t("styleChipCreator");
      default:
        return chip.id;
    }
  }

  return (
    <div>
      {/* チップ列(横スクロール)。探索シートと同じ操作感。 */}
      <div
        className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={t("styleBrowseSheetTitle")}
      >
        {chips.map((chip) => {
          const active = chip.id === activeChip;
          const emoji = CHIP_EMOJI[chip.id];
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveChip(chip.id)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {emoji ? `${emoji} ` : ""}
              {chipLabel(chip)}
            </button>
          );
        })}
      </div>

      {/* 人気/新着の基準を明示する(探索シートと同じ注記)。 */}
      {activeChip === "popular" && filtered.length > 0 ? (
        <p className="mb-3 text-xs text-slate-500">
          {t("stylePopularSortNote")}
        </p>
      ) : null}
      {activeChip === "new" && filtered.length > 0 ? (
        <p className="mb-3 text-xs text-slate-500">
          {t("styleNewSortNote", { days: STYLE_NEW_WINDOW_DAYS })}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-500">
          {activeChip === "favorites"
            ? t("styleFavoritesEmpty")
            : t("styleBrowseEmpty")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {filtered.map((preset) => (
            <PublicStyleCard
              key={preset.id}
              preset={preset}
              locale={locale}
              onSelect={setConfirmingPreset}
            />
          ))}
        </div>
      )}

      {/* ホームのカルーセルと共通の試着確認モーダル。「試着する」で /style へ遷移する。 */}
      <StyleTryOnConfirmDialog
        preset={confirmingPreset}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingPreset(null);
          }
        }}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
