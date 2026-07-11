"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode } from "swiper/modules";
import { PartyPopper } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  CollectionProgressModal,
  type CollectionCelebration,
} from "@/features/collections/components/CollectionProgressModal";
import {
  CollectionMountComposer,
  type MountGeneratedResult,
} from "@/features/collections/components/CollectionMountComposer";
import { mountAspectForCategory } from "@/features/collections/lib/mount-aspects";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import type { CompletedMountView } from "@/features/my-page/components/MyPageCollections";
import type {
  EventShelf,
  EventShelfCard,
} from "@/features/home/lib/derive-event-shelves";

import "swiper/css";
import "swiper/css/free-mode";

// StylePresetPreviewCard と同寸(180 x 240+44)。celebration カードのサイズ合わせ用。
const CARD_WIDTH_PX = 180;
const CARD_HEIGHT_PX = 284;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface HomeEventShelfSectionProps {
  shelf: EventShelf;
  /** サーバーで解決したリクエスト時刻(ISO)。カウントダウンのSSR/CSR不一致を防ぐ。 */
  nowIso: string;
  /**
   * 全コンプ済みユーザーの完成台紙(マイページと同一ソース)。あれば🎉カードの
   * 代わりに台紙サムネを出し、タップでマイページと同じ完了モーダルを開く。
   * null(未作成/未ログイン)なら /collections リンクのお祝いカードにフォールバック。
   */
  completedMount?: CompletedMountView | null;
}

/**
 * ホーム「開催中の企画」棚(1企画ぶん)。
 * カードは NEW(生成できる) → シルエット(次の1枚) → ✓済み の順で
 * deriveEventShelves が並べ終えたものをそのまま描画する。
 */
export function HomeEventShelfSection({
  shelf,
  nowIso,
  completedMount = null,
}: HomeEventShelfSectionProps) {
  const router = useRouter();
  const t = useTranslations("home");
  const tStyle = useTranslations("style");
  const locale = useLocale();
  const { toast } = useToast();
  const [confirmingPreset, setConfirmingPreset] =
    useState<StylePresetPublicSummary | null>(null);

  // 完成台紙タップ時のモーダル(マイページの openMountModal と同挙動)。
  const [mountCelebration, setMountCelebration] =
    useState<CollectionCelebration | null>(null);
  const [celebrationNonce, setCelebrationNonce] = useState(0);
  const [composer, setComposer] = useState<{
    categoryKey: string;
    displayName: string;
    threshold: number;
  } | null>(null);
  const [recomposeInfo, setRecomposeInfo] = useState<{
    threshold: number;
    canRecompose: boolean;
  } | null>(null);

  // 「台紙を更新する」の表示可否(マイページと同じ /api/collections/options 判定)。
  const loadRecomposeInfo = useCallback(async () => {
    if (!completedMount) return null;
    try {
      const r = await fetch(
        `/api/collections/options?categoryKey=${encodeURIComponent(completedMount.categoryKey)}`,
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
      setRecomposeInfo(info);
      return info;
    } catch {
      return null;
    }
  }, [completedMount]);

  const openMountModal = useCallback(() => {
    if (!completedMount) return;
    setCelebrationNonce((n) => n + 1);
    setMountCelebration({
      categoryKey: completedMount.categoryKey,
      displayName: completedMount.displayName,
      fromCount: 0,
      toCount: 0,
      threshold: recomposeInfo?.threshold ?? 0,
      isCompleted: true,
      mountImageUrl: completedMount.mountImageUrl,
      // book は redirect 元の /m/<id>(chrome付き)を経由するとチラつくため /m/<id>/book へ直行。
      sharePath:
        completedMount.completionViewMode === "book"
          ? `/m/${completedMount.completionId}/book`
          : `/m/${completedMount.completionId}`,
      completionId: completedMount.completionId,
      mountTemplateWidth: completedMount.mountTemplateWidth,
      mountTemplateHeight: completedMount.mountTemplateHeight,
      characterImageUrl: null,
      collectedImageUrls: [],
      canRecompose: recomposeInfo?.canRecompose ?? false,
      // 完了済み台紙の見返しなので、紙吹雪ではなくダイヤのきらめき演出にする。
      celebrationEffect: "sparkle",
    });
    if (!recomposeInfo) {
      void loadRecomposeInfo().then((info) => {
        if (!info) return;
        setMountCelebration((prev) =>
          prev && prev.completionId === completedMount.completionId
            ? {
                ...prev,
                threshold: info.threshold,
                canRecompose: info.canRecompose,
              }
            : prev,
        );
      });
    }
  }, [completedMount, recomposeInfo, loadRecomposeInfo]);

  // モーダル内「台紙を更新する」→ 画像選択(composer)を開く(マイページと同挙動)。
  const openComposerFromCelebration = useCallback(
    (c: CollectionCelebration) => {
      setMountCelebration(null);
      setComposer({
        categoryKey: c.categoryKey,
        displayName: c.displayName,
        threshold: c.threshold,
      });
    },
    [],
  );

  // 台紙の再生成完了 → 完了モーダル(新台紙+シェア)を表示し、サーバー cache を再反映。
  const handleGenerated = useCallback(
    (result: MountGeneratedResult) => {
      const target = composer;
      setComposer(null);
      setCelebrationNonce((n) => n + 1);
      setMountCelebration({
        categoryKey: result.categoryKey,
        displayName: target?.displayName ?? "",
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
      router.refresh();
    },
    [composer, router],
  );

  const cardLocale = locale === "en" ? "en" : "ja";
  const displayName =
    cardLocale === "en" ? shelf.displayNameEn : shelf.displayNameJa;

  // 残り日数(切り上げ)。当日=1。期間外の棚はサーバー側で除外済みだが防御的に負値は隠す。
  let countdownLabel: string | null = null;
  let countdownUrgent = false;
  if (shelf.endsAt) {
    const msLeft = new Date(shelf.endsAt).getTime() - new Date(nowIso).getTime();
    const daysLeft = Math.ceil(msLeft / MS_PER_DAY);
    if (daysLeft >= 1) {
      countdownUrgent = daysLeft <= 1;
      countdownLabel = countdownUrgent
        ? t("eventShelfCountdownLastDay")
        : t("eventShelfCountdownDaysLeft", { days: daysLeft });
    }
  }

  const handleTeaserTap = () => {
    toast({ description: t("eventShelfTeaserToast") });
  };

  const handleConfirm = () => {
    const preset = confirmingPreset;
    if (!preset) {
      return;
    }
    setConfirmingPreset(null);
    router.push(`/style?style=${encodeURIComponent(preset.id)}`);
  };

  const renderCard = (card: EventShelfCard) => {
    if (card.kind === "celebration") {
      // 本人の完成台紙があれば、マイページのコレクション欄と同じサムネ+同じタップ挙動
      // (完了モーダル=台紙拡大+シェア+台紙更新)にする。
      if (completedMount) {
        return (
          <button
            type="button"
            onClick={openMountModal}
            className="relative flex-shrink-0 overflow-hidden rounded-xl border border-amber-300 shadow-sm transition hover:ring-2 hover:ring-amber-300"
            style={{
              height: CARD_HEIGHT_PX,
              aspectRatio: mountAspectForCategory(
                completedMount.categoryKey,
                completedMount.mountTemplateWidth,
                completedMount.mountTemplateHeight,
              ),
            }}
            aria-label={`${completedMount.displayName} のカードを表示`}
          >
            <Image
              src={completedMount.mountImageUrl}
              alt={`${completedMount.displayName} コンプリートカード`}
              fill
              sizes={`${CARD_WIDTH_PX}px`}
              className="object-cover"
            />
            <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white shadow">
              {t("eventShelfCelebrationTitle")}
            </span>
          </button>
        );
      }
      // 台紙未作成(または未ログイン)時のフォールバック。
      return (
        <button
          type="button"
          onClick={() => router.push("/collections")}
          className="flex-shrink-0 text-left"
          aria-label={t("eventShelfCelebrationAction")}
        >
          <div
            className="flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-pink-100 shadow-sm transition hover:ring-2 hover:ring-amber-300"
            style={{ width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX }}
          >
            <PartyPopper className="h-10 w-10 text-amber-500" aria-hidden="true" />
            <p className="text-sm font-bold text-amber-800">
              {t("eventShelfCelebrationTitle")}
            </p>
            <p className="text-xs text-amber-700 underline">
              {t("eventShelfCelebrationAction")}
            </p>
          </div>
        </button>
      );
    }

    const preset = card.preset;
    if (!preset) {
      return null;
    }

    if (card.kind === "teaser") {
      // dripLocked カードは内部で非クリック描画になるため、トースト用に外側で拾う。
      return (
        <div
          role="button"
          tabIndex={0}
          onClick={handleTeaserTap}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleTeaserTap();
            }
          }}
          className="cursor-pointer"
          aria-label={tStyle("styleDripLockedLabel")}
        >
          <StylePresetPreviewCard
            preset={preset}
            alt={tStyle("styleCardAlt", { name: preset.title })}
            locale={cardLocale}
            dripLocked
            dripLockedLabel={tStyle("styleDripLockedLabel")}
          />
        </div>
      );
    }

    if (card.kind === "done") {
      return (
        <div className="relative">
          <div className="opacity-65">
            <StylePresetPreviewCard
              preset={preset}
              alt={tStyle("styleCardAlt", { name: preset.title })}
              locale={cardLocale}
              onClick={() => setConfirmingPreset(preset)}
            />
          </div>
          <span
            className="pointer-events-none absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white shadow"
            aria-label={t("eventShelfDoneBadge")}
          >
            ✓
          </span>
        </div>
      );
    }

    // kind === "new"
    return (
      <div className="relative">
        <StylePresetPreviewCard
          preset={preset}
          alt={tStyle("styleCardAlt", { name: preset.title })}
          locale={cardLocale}
          onClick={() => setConfirmingPreset(preset)}
        />
        <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
          NEW
        </span>
      </div>
    );
  };

  return (
    // overflow-x-hidden: Swiper側は !overflow-visible のため、既存カルーセルと同様に
    // 外側でスライドのはみ出しを刈り取る(無いとPC幅でカードが左右に飛び出す)。
    <section className="mb-8 overflow-x-hidden">
      <div className="mb-3 flex items-center justify-between gap-2 px-4 sm:px-0">
        <h2 className="flex min-w-0 items-baseline gap-2 text-lg font-semibold text-gray-900">
          <span className="min-w-0 truncate">
            <span aria-hidden="true">🔥 </span>
            {displayName}
          </span>
          {shelf.totalCount !== null && (
            <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-gray-500">
              {shelf.collectedCount}/{shelf.totalCount}
            </span>
          )}
        </h2>
        {countdownLabel && (
          <span
            className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
              countdownUrgent
                ? "bg-red-500 text-white"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            {countdownLabel}
          </span>
        )}
      </div>
      <div className="-mx-4 px-4">
        <Swiper
          modules={[FreeMode]}
          slidesPerView="auto"
          spaceBetween={12}
          freeMode={{ enabled: true, momentum: true, momentumRatio: 0.4 }}
          grabCursor
          allowTouchMove
          className="!overflow-visible"
        >
          {shelf.cards.map((card, index) => (
            <SwiperSlide
              key={card.preset ? card.preset.id : `celebration-${index}`}
              style={{ width: "auto" }}
            >
              {renderCard(card)}
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
      <AlertDialog
        open={confirmingPreset !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingPreset(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("stylePresetConfirmTitle")}</AlertDialogTitle>
          </AlertDialogHeader>
          {confirmingPreset ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="relative aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-lg bg-gray-100">
                <Image
                  src={confirmingPreset.thumbnailImageUrl}
                  alt={tStyle("styleCardAlt", {
                    name: confirmingPreset.title,
                  })}
                  fill
                  sizes="280px"
                  className="object-cover object-top"
                />
              </div>
              <p className="text-base font-medium text-slate-900">
                {confirmingPreset.title}
              </p>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("stylePresetConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {t("stylePresetConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CollectionProgressModal
        key={
          mountCelebration
            ? `${mountCelebration.categoryKey}-${celebrationNonce}`
            : "none"
        }
        open={!!mountCelebration}
        celebration={mountCelebration}
        onClose={() => setMountCelebration(null)}
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
    </section>
  );
}
