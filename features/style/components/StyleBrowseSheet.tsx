"use client";

import { useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import {
  deriveStyleBrowseChips,
  filterStyleBrowsePresets,
  type StyleBrowseChipId,
} from "@/features/style/lib/style-browse-filter";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

/** チップ先頭の絵文字(装飾)。ラベル本文は i18n で解決する。 */
const CHIP_EMOJI: Partial<Record<string, string>> = {
  favorites: "♡",
  new: "✨",
  popular: "👑",
  creator: "🤝",
};

interface StyleBrowseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: readonly StylePresetPublicSummary[];
  /** プリセットID -> 直近生成数(👑人気の並び替え/表示判定)。 */
  generateCounts: Readonly<Record<string, number>>;
  /** 現在のお気に入りID集合(楽観更新済みの最新値)。 */
  favoriteIds: ReadonlySet<string>;
  /** ♡トグル。ゲスト時の誘導も含め呼び出し側(StylePageClient)が処理する。 */
  onToggleFavorite: (presetId: string, next: boolean) => void;
  /** カード選択。呼び出し側でシートを閉じて選択状態にする。 */
  onSelectPreset: (presetId: string) => void;
  isAuthenticated: boolean;
  /** 企画カードの「生成済み ✓」用(ストリップと同じ集合)。 */
  generatedPresetIds: ReadonlySet<string>;
  locale: "ja" | "en";
  /** 選択中プリセット(シート内でもハイライト)。 */
  selectedPresetId: string | null;
}

/**
 * /style の探索シート(チップ+グリッド)。
 * 「すべて見る」から全画面で開き、チップで絞り込んでカードを選ぶと閉じて生成フローへ。
 * presets はストリップと同一(解放ゲート適用済み)を受け取り、追加フェッチしない。
 */
export function StyleBrowseSheet({
  open,
  onOpenChange,
  presets,
  generateCounts,
  favoriteIds,
  onToggleFavorite,
  onSelectPreset,
  isAuthenticated,
  generatedPresetIds,
  locale,
  selectedPresetId,
}: StyleBrowseSheetProps) {
  const t = useTranslations("style");
  const [activeChip, setActiveChip] = useState<StyleBrowseChipId>("all");

  // now はチップ導出/絞り込みの「新着」判定にだけ使う。シートを開いている間は
  // 固定でよいので、open が変わったときだけ取り直す。
  const now = useMemo(() => new Date(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const context = useMemo(
    () => ({ favoriteIds, generateCounts, now, isAuthenticated }),
    [favoriteIds, generateCounts, now, isAuthenticated],
  );
  const chips = useMemo(
    () => deriveStyleBrowseChips(presets, context),
    [presets, context],
  );
  const filtered = useMemo(
    () => filterStyleBrowsePresets(presets, activeChip, context),
    [presets, activeChip, context],
  );

  function chipLabel(chip: (typeof chips)[number]): string {
    if (chip.id.startsWith("category:")) {
      return (
        (locale === "en" ? chip.categoryLabelEn : chip.categoryLabelJa) ??
        chip.id
      );
    }
    switch (chip.id) {
      case "all":
        return t("styleChipAll");
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] gap-0 rounded-none border-t-0 p-0"
      >
        <SheetHeader className="border-b px-4 pb-3 pt-4">
          <SheetTitle className="text-left text-lg font-semibold text-gray-900">
            {t("styleBrowseSheetTitle")}
          </SheetTitle>
          {/* チップ列(横スクロール) */}
          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-1"
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
        </SheetHeader>

        {/* グリッド本体(スクロール領域) */}
        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4">
          {filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-500">
              {activeChip === "favorites"
                ? t("styleFavoritesEmpty")
                : t("styleBrowseEmpty")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((preset) => {
                const isDripLocked = preset.locked === true;
                const isFavorite = favoriteIds.has(preset.id);
                return (
                  <div key={preset.id} className="relative">
                    <StylePresetPreviewCard
                      preset={preset}
                      fluid
                      alt={t("styleCardAlt", { name: preset.title })}
                      locale={locale}
                      isSelected={
                        !isDripLocked && preset.id === selectedPresetId
                      }
                      onClick={
                        isDripLocked
                          ? undefined
                          : () => onSelectPreset(preset.id)
                      }
                      dripLocked={isDripLocked}
                      dripLockedLabel={
                        isDripLocked ? t("styleDripLockedLabel") : undefined
                      }
                      generated={
                        !isDripLocked && generatedPresetIds.has(preset.id)
                      }
                      generatedLabel={t("styleGeneratedBadge")}
                    />
                    {/* ♡はカード(button)の兄弟としてオーバーレイ配置(buttonネスト回避)。
                        左上=空き位置(✓=右上/カテゴリバッジ=左下)。locked には出さない。 */}
                    {!isDripLocked ? (
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(preset.id, !isFavorite)}
                        aria-label={
                          isFavorite
                            ? t("styleFavoriteRemove")
                            : t("styleFavoriteAdd")
                        }
                        aria-pressed={isFavorite}
                        className="absolute left-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                      >
                        <Heart
                          className={`h-4 w-4 ${
                            isFavorite
                              ? "fill-rose-500 text-rose-500"
                              : "text-slate-400"
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
