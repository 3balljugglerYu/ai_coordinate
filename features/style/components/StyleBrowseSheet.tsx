"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Bookmark } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import { StyleProviderCredit } from "@/features/style/components/StyleProviderCredit";
import { resolveStylePresetProvider } from "@/features/style-presets/lib/schema";
import {
  deriveStyleBrowseChips,
  filterStyleBrowsePresets,
  STYLE_NEW_WINDOW_DAYS,
  type StyleBrowseChipId,
} from "@/features/style/lib/style-browse-filter";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

/** チップ先頭の絵文字(装飾)。ラベル本文は i18n で解決する。 */
const CHIP_EMOJI: Partial<Record<string, string>> = {
  event: "🎉",
  favorites: "🔖",
  new: "✨",
  popular: "👑",
  creator: "🤝",
};

/** 拡大プレビューを「下スワイプで閉じる」と判定する移動量(px)。 */
const SWIPE_CLOSE_THRESHOLD_PX = 80;

interface StyleBrowseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: readonly StylePresetPublicSummary[];
  /** プリセットID -> 直近生成数(👑人気の並び替え/表示判定)。 */
  generateCounts: Readonly<Record<string, number>>;
  /** プリセットID -> 累計生成数(拡大プレビューの「これまでに◯回」表示)。 */
  generateTotals: Readonly<Record<string, number>>;
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
  generateTotals,
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
  // カードタップは即選択せず、拡大プレビュー+「試着しますか？」の確認を挟む
  // (ホーム企画棚と同じ体験。小さいグリッドの誤タップ防止も兼ねる)。
  const [confirmingPreset, setConfirmingPreset] =
    useState<StylePresetPublicSummary | null>(null);
  // 「下スワイプで閉じる」用: スワイプ開始Y座標(モバイルの自然な閉じ操作)。
  // touch イベントでなく Pointer Events を使う(DevTools のデバイスモードや
  // ペン入力でも動くように)。マウスは対象外(テキスト選択ドラッグ等との誤反応防止)。
  const swipeStartYRef = useRef<number | null>(null);

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
          {/* 人気は「直近30日」窓の並び順、新着は「直近14日」窓の絞り込み。
              拡大プレビューの累計回数と食い違って見えることがあるため、
              チップの基準をグリッド上部に明示する。 */}
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
                          : () => setConfirmingPreset(preset)
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
                    {/* お気に入り(しおり)はカード(button)の兄弟としてオーバーレイ配置
                        (buttonネスト回避)。ハートはホームの「いいね」と紛らわしいため
                        ブックマークアイコンを使う。左上=空き位置(✓=右上/カテゴリバッジ=左下)。
                        locked には出さない。 */}
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
                        className="absolute left-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      >
                        <Bookmark
                          className={`h-4 w-4 ${
                            isFavorite
                              ? "fill-slate-700 text-slate-700"
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

        {/* 拡大プレビュー+確認。気軽に眺めて戻れるよう AlertDialog でなく通常の
            Dialog を使う(外側タップ・Esc・×・下スワイプで閉じられる)。
            「試着する」で確定し、シートごと閉じて生成フローへ。 */}
        <Dialog
          open={confirmingPreset !== null}
          onOpenChange={(dialogOpen) => {
            if (!dialogOpen) {
              setConfirmingPreset(null);
            }
          }}
        >
          <DialogContent
            // モバイルの自然な操作として「下スワイプで閉じる」に対応する。
            // Pointer Events で touch/pen のみ対象(マウスのドラッグは無視)。
            onPointerDown={(event) => {
              if (event.pointerType !== "mouse") {
                swipeStartYRef.current = event.clientY;
              }
            }}
            onPointerUp={(event) => {
              const startY = swipeStartYRef.current;
              swipeStartYRef.current = null;
              if (
                event.pointerType !== "mouse" &&
                startY !== null &&
                event.clientY - startY > SWIPE_CLOSE_THRESHOLD_PX
              ) {
                setConfirmingPreset(null);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle className="text-center">
                {t("styleBrowseConfirmTitle")}
              </DialogTitle>
            </DialogHeader>
            {confirmingPreset ? (
              <div className="flex flex-col items-center gap-3 py-2">
                {/* 画像はサムネの実アスペクト比で表示(拡大表示と同様、横長はクロップしない)。
                    縦長はダイアログが縦に伸びすぎないよう幅280pxに抑え、横長は全幅を使う。 */}
                <div
                  className={`relative w-full overflow-hidden rounded-lg bg-gray-100 ${
                    confirmingPreset.thumbnailWidth >
                    confirmingPreset.thumbnailHeight
                      ? ""
                      : "max-w-[280px]"
                  }`}
                  style={{
                    aspectRatio:
                      confirmingPreset.thumbnailWidth > 0 &&
                      confirmingPreset.thumbnailHeight > 0
                        ? `${confirmingPreset.thumbnailWidth} / ${confirmingPreset.thumbnailHeight}`
                        : "3 / 4",
                  }}
                >
                  <Image
                    src={confirmingPreset.thumbnailImageUrl}
                    alt={t("styleCardAlt", { name: confirmingPreset.title })}
                    fill
                    sizes="(max-width: 640px) 90vw, 480px"
                    className="object-cover object-top"
                  />
                  {/* グリッドと同じお気に入り(しおり)トグルを拡大表示にも置く。 */}
                  <button
                    type="button"
                    onClick={() =>
                      onToggleFavorite(
                        confirmingPreset.id,
                        !favoriteIds.has(confirmingPreset.id),
                      )
                    }
                    aria-label={
                      favoriteIds.has(confirmingPreset.id)
                        ? t("styleFavoriteRemove")
                        : t("styleFavoriteAdd")
                    }
                    aria-pressed={favoriteIds.has(confirmingPreset.id)}
                    className="absolute left-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <Bookmark
                      className={`h-5 w-5 ${
                        favoriteIds.has(confirmingPreset.id)
                          ? "fill-slate-700 text-slate-700"
                          : "text-slate-400"
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <p className="text-base font-medium text-slate-900">
                  {confirmingPreset.title}
                </p>
                {/* クリエイター表記(カードと同じ解決順: preset優先→カテゴリ)。 */}
                {(() => {
                  const provider = resolveStylePresetProvider(confirmingPreset);
                  return provider ? (
                    <StyleProviderCredit
                      nickname={provider.nickname}
                      avatarUrl={provider.avatarUrl}
                      locale={locale}
                    />
                  ) : null;
                })()}
                {/* 累計利用回数(0回は出さない)。 */}
                {(generateTotals[confirmingPreset.id] ?? 0) > 0 ? (
                  <p className="text-xs text-slate-500">
                    {t("styleUsageCount", {
                      count: generateTotals[confirmingPreset.id],
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => {
                  if (confirmingPreset) {
                    onSelectPreset(confirmingPreset.id);
                  }
                  setConfirmingPreset(null);
                }}
              >
                {t("styleBrowseConfirmAction")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmingPreset(null)}
              >
                {t("styleBrowseConfirmCancel")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
