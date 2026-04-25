"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

import "swiper/css";
import "swiper/css/free-mode";

interface HomeStylePresetCarouselProps {
  presets: StylePresetPublicSummary[];
}

const SCROLL_VELOCITY_PX_PER_SEC = 32;
const MAX_FRAME_DELTA_MS = 100;
const SLIDE_PITCH_PX = 192; // card 180 + spaceBetween 12
const TRANSLATE_STORAGE_KEY = "home-style-carousel-translate";

function readSavedTranslate(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(TRANSLATE_STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function saveCurrentTranslate(swiper: SwiperType | null) {
  if (!swiper?.wrapperEl || typeof window === "undefined") {
    return;
  }
  try {
    const matrix = new DOMMatrixReadOnly(
      window.getComputedStyle(swiper.wrapperEl).transform
    );
    window.sessionStorage.setItem(TRANSLATE_STORAGE_KEY, String(matrix.m41));
  } catch {
    // sessionStorage may be unavailable (private mode, quota); ignore.
  }
}

export function HomeStylePresetCarousel({
  presets,
}: HomeStylePresetCarouselProps) {
  const router = useRouter();
  const t = useTranslations("style");
  const tHome = useTranslations("home");
  const swiperRef = useRef<SwiperType | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isVisibleRef = useRef(true);
  const isUserActiveRef = useRef(false);
  const isDialogOpenRef = useRef(false);
  const [confirmingPreset, setConfirmingPreset] =
    useState<StylePresetPublicSummary | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let rafId: number | null = null;
    let lastTime = performance.now();
    const realWidthPx = presets.length * SLIDE_PITCH_PX;

    const tick = (now: number) => {
      const delta = Math.min(now - lastTime, MAX_FRAME_DELTA_MS);
      lastTime = now;
      const swiper = swiperRef.current;
      if (
        swiper &&
        swiper.wrapperEl &&
        isVisibleRef.current &&
        !isUserActiveRef.current &&
        !isDialogOpenRef.current &&
        !swiper.animating
      ) {
        swiper.wrapperEl.style.transitionDuration = "0ms";
        let next =
          swiper.translate - (SCROLL_VELOCITY_PX_PER_SEC * delta) / 1000;
        // Slides are rendered three times. We keep `next` in the central
        // band [-2*realWidthPx, 0] so dragging in either direction still
        // shows content from the other copies. Wrap is invisible because
        // the three copies are visually identical.
        if (next < -2 * realWidthPx) {
          next += realWidthPx;
        } else if (next > 0) {
          next -= realWidthPx;
        }
        swiper.setTranslate(next);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        const visible = entry.isIntersecting && !document.hidden;
        if (!visible) {
          saveCurrentTranslate(swiperRef.current);
        }
        isVisibleRef.current = visible;
        // Reset to avoid a huge delta jump after the carousel was paused.
        lastTime = performance.now();
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(container);

    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      if (!visible) {
        saveCurrentTranslate(swiperRef.current);
      }
      isVisibleRef.current = visible;
      lastTime = performance.now();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handlePageHide = () => {
      saveCurrentTranslate(swiperRef.current);
    };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      saveCurrentTranslate(swiperRef.current);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [presets.length]);

  if (presets.length === 0) {
    return null;
  }

  const handleSelect = (preset: StylePresetPublicSummary) => {
    saveCurrentTranslate(swiperRef.current);
    isDialogOpenRef.current = true;
    setConfirmingPreset(preset);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      isDialogOpenRef.current = false;
      setConfirmingPreset(null);
    }
  };

  const handleConfirm = () => {
    const preset = confirmingPreset;
    if (!preset) {
      return;
    }
    isDialogOpenRef.current = false;
    setConfirmingPreset(null);
    router.push(`/style?style=${encodeURIComponent(preset.id)}`);
  };

  return (
    <div ref={containerRef} className="mb-8 overflow-x-hidden">
      <h2 className="mb-3 px-4 text-lg font-semibold text-gray-900 sm:px-0">
        {tHome("stylePresetCarouselTitle")}
      </h2>
      <div className="-mx-4 px-4">
        <Swiper
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
            const wrapperEl = swiper.wrapperEl;
            if (!wrapperEl) {
              return;
            }
            wrapperEl.style.transitionDuration = "0ms";

            const realWidthPx = presets.length * SLIDE_PITCH_PX;
            const savedTranslate = readSavedTranslate();
            // Default to the middle copy so the user has buffer in both
            // drag directions. Restored values are normalized into the
            // valid central band [-2*realWidthPx, 0].
            let initialTranslate = -realWidthPx;
            if (savedTranslate !== null) {
              let normalized = savedTranslate;
              while (normalized > 0) normalized -= realWidthPx;
              while (normalized < -2 * realWidthPx)
                normalized += realWidthPx;
              initialTranslate = normalized;
            }
            swiper.setTranslate(initialTranslate);
            swiper.update();

            wrapperEl.style.transform = `translate3d(${swiper.translate}px, 0, 0)`;
            void wrapperEl.offsetHeight;
            wrapperEl.style.transitionDuration = "";
          }}
          onTouchStart={() => {
            isUserActiveRef.current = true;
          }}
          onTouchEnd={() => {
            isUserActiveRef.current = false;
          }}
          modules={[FreeMode]}
          slidesPerView="auto"
          spaceBetween={12}
          freeMode={{ enabled: true, momentum: true, momentumRatio: 0.4 }}
          grabCursor
          allowTouchMove
          observer
          observeParents
          className="!overflow-visible"
        >
          {[...presets, ...presets, ...presets].map((preset, index) => {
            const copy = ["a", "b", "c"][Math.floor(index / presets.length)];
            return (
              <SwiperSlide
                key={`${preset.id}-${copy}`}
                style={{ width: "auto" }}
              >
                <StylePresetPreviewCard
                  preset={preset}
                  alt={t("styleCardAlt", { name: preset.title })}
                  onClick={() => handleSelect(preset)}
                />
              </SwiperSlide>
            );
          })}
        </Swiper>
      </div>
      <AlertDialog
        open={confirmingPreset !== null}
        onOpenChange={handleDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tHome("stylePresetConfirmTitle")}
            </AlertDialogTitle>
          </AlertDialogHeader>
          {confirmingPreset ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="relative aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-lg bg-gray-100">
                <Image
                  src={confirmingPreset.thumbnailImageUrl}
                  alt={t("styleCardAlt", { name: confirmingPreset.title })}
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
              {tHome("stylePresetConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {tHome("stylePresetConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
