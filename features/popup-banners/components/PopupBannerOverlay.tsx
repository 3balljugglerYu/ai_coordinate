"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePopupBanner } from "@/features/popup-banners/hooks/usePopupBanner";
import type { ActivePopupBanner } from "@/features/popup-banners/lib/schema";

interface PopupBannerOverlayProps {
  banners: ActivePopupBanner[];
}

function getSafeLinkUrl(url: string | null) {
  if (!url) {
    return null;
  }

  const trimmed = url.trim();
  if (trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  return null;
}

function isExternalUrl(url: string | null) {
  return Boolean(url?.startsWith("https://"));
}

export function PopupBannerOverlay({ banners }: PopupBannerOverlayProps) {
  const t = useTranslations("popupBanners");
  const {
    currentBanner,
    isReady,
    clickBanner,
    closeBanner,
    markBannerDisplayed,
  } = usePopupBanner(banners);
  const [dismissForeverByBannerId, setDismissForeverByBannerId] = useState<
    Record<string, boolean>
  >({});
  const [readyBannerId, setReadyBannerId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentBanner) {
      return;
    }

    if (readyBannerId === currentBanner.id) {
      return;
    }

    let cancelled = false;
    let resolved = false;
    const preloadImage = new window.Image();
    const finalize = () => {
      if (cancelled || resolved) {
        return;
      }

      resolved = true;
      window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }

        setReadyBannerId(currentBanner.id);
        markBannerDisplayed(currentBanner.id);
      });
    };
    const decodeAndFinalize = () => {
      if (typeof preloadImage.decode === "function") {
        preloadImage.decode().catch(() => undefined).finally(finalize);
        return;
      }

      finalize();
    };

    preloadImage.onload = decodeAndFinalize;
    preloadImage.onerror = finalize;
    preloadImage.src = currentBanner.imageUrl;

    if (preloadImage.complete) {
      decodeAndFinalize();
    }

    return () => {
      cancelled = true;
      preloadImage.onload = null;
      preloadImage.onerror = null;
    };
  }, [
    currentBanner,
    markBannerDisplayed,
    readyBannerId,
  ]);

  const visibleBanner =
    isReady && currentBanner && readyBannerId === currentBanner.id
      ? currentBanner
      : null;

  if (!visibleBanner) {
    return null;
  }

  const dismissForeverChecked = dismissForeverByBannerId[visibleBanner.id] ?? false;
  const safeLinkUrl = getSafeLinkUrl(visibleBanner.linkUrl);
  const shouldAllowDismissForever =
    visibleBanner.showOnceOnly && dismissForeverChecked;

  const imageCard = (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[28px] bg-slate-100 shadow-2xl">
      <Image
        src={visibleBanner.imageUrl}
        alt={visibleBanner.alt || t("imageAltFallback")}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 80vw, 420px"
        priority
      />
    </div>
  );

  return (
    <Dialog
      open={!!currentBanner}
      onOpenChange={(open) => {
        if (!open) {
          closeBanner(shouldAllowDismissForever);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="w-[min(92vw,420px)] gap-4 border-none bg-transparent p-0 shadow-none"
      >
        <DialogTitle className="sr-only">{t("dialogTitle")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("dialogDescription")}
        </DialogDescription>

        <div className="popup-banner-card-enter relative">
          <button
            type="button"
            onClick={() => closeBanner(shouldAllowDismissForever)}
            className="absolute right-3 top-3 z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            aria-label={t("close")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>

          {safeLinkUrl ? (
            isExternalUrl(safeLinkUrl) ? (
              <a
                href={safeLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block transition-transform duration-200 hover:scale-[1.01]"
                onClick={() => clickBanner()}
              >
                {imageCard}
              </a>
            ) : (
              <Link
                href={safeLinkUrl}
                className="block transition-transform duration-200 hover:scale-[1.01]"
                onClick={() => clickBanner()}
              >
                {imageCard}
              </Link>
            )
          ) : (
            imageCard
          )}
        </div>

        {visibleBanner.showOnceOnly ? (
          <div className="popup-banner-panel-enter p-2">
            <label className="flex cursor-pointer items-center justify-center gap-3 text-sm text-white">
              <span className="relative flex size-5 items-center justify-center">
                <Checkbox
                  checked={dismissForeverChecked}
                  onCheckedChange={(checked) =>
                    setDismissForeverByBannerId((current) => ({
                      ...current,
                      [visibleBanner.id]: checked === true,
                    }))
                  }
                  className="size-5 border-white/75 bg-black/20 shadow-sm data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-transparent"
                />
                <Check
                  className={`pointer-events-none absolute size-3.5 transition-opacity ${
                    dismissForeverChecked
                      ? "opacity-100 text-slate-900"
                      : "opacity-0 text-transparent"
                  }`}
                  aria-hidden
                />
              </span>
              <span>{t("dismissForever")}</span>
            </label>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
