"use client";

import { useState } from "react";
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
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
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
}

/**
 * ホーム「開催中の企画」棚(1企画ぶん)。
 * カードは NEW(生成できる) → シルエット(次の1枚) → ✓済み の順で
 * deriveEventShelves が並べ終えたものをそのまま描画する。
 */
export function HomeEventShelfSection({
  shelf,
  nowIso,
}: HomeEventShelfSectionProps) {
  const router = useRouter();
  const t = useTranslations("home");
  const tStyle = useTranslations("style");
  const locale = useLocale();
  const { toast } = useToast();
  const [confirmingPreset, setConfirmingPreset] =
    useState<StylePresetPublicSummary | null>(null);

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
    </section>
  );
}
