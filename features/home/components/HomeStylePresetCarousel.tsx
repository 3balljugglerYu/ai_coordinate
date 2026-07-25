"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LayoutGrid } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import { StyleTryOnConfirmDialog } from "@/features/style-presets/components/StyleTryOnConfirmDialog";
import {
  DEFAULT_LOCALE,
  isLocale,
  localizePublicPath,
} from "@/i18n/config";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

import "swiper/css";
import "swiper/css/free-mode";

interface HomeStylePresetCarouselProps {
  presets: StylePresetPublicSummary[];
  /** NEW バッジを付ける新着プリセットID(登録14日以内)。 */
  newPresetIds?: readonly string[];
}

const SCROLL_VELOCITY_PX_PER_SEC = 32;
const MAX_FRAME_DELTA_MS = 100;
const TRANSLATE_STORAGE_KEY = "home-style-carousel-translate";

/**
 * Read the per-slide pitch (slide width + spaceBetween) from Swiper's
 * measured snapGrid. Returns null until Swiper has computed its layout.
 * We avoid hardcoding the value so that any change to card width or
 * spaceBetween automatically flows through to the loop wrap math.
 */
function getSlidePitchPx(swiper: SwiperType): number | null {
  const grid = swiper.snapGrid;
  if (!Array.isArray(grid) || grid.length < 2) {
    return null;
  }
  const pitch = grid[1] - grid[0];
  return pitch > 0 ? pitch : null;
}

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
  newPresetIds,
}: HomeStylePresetCarouselProps) {
  const router = useRouter();
  const t = useTranslations("style");
  const tHome = useTranslations("home");
  const localeValue = useLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const swiperRef = useRef<SwiperType | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isUserActiveRef = useRef(false);
  const isDialogOpenRef = useRef(false);
  const [confirmingPreset, setConfirmingPreset] =
    useState<StylePresetPublicSummary | null>(null);
  const newPresetIdSet = new Set(newPresetIds ?? []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let rafId: number | null = null;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(now - lastTime, MAX_FRAME_DELTA_MS);
      lastTime = now;
      const swiper = swiperRef.current;
      if (
        swiper &&
        swiper.wrapperEl &&
        !isUserActiveRef.current &&
        !isDialogOpenRef.current &&
        !swiper.animating
      ) {
        const slidePitch = getSlidePitchPx(swiper);
        if (slidePitch !== null) {
          swiper.wrapperEl.style.transitionDuration = "0ms";
          const realWidthPx = presets.length * slidePitch;
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
      }
      rafId = requestAnimationFrame(tick);
    };

    const startTick = () => {
      if (rafId !== null) {
        return;
      }
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    };

    const stopTick = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    startTick();

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        const visible = entry.isIntersecting && !document.hidden;
        if (visible) {
          startTick();
        } else {
          saveCurrentTranslate(swiperRef.current);
          stopTick();
        }
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(container);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveCurrentTranslate(swiperRef.current);
        stopTick();
        return;
      }
      const rect = container.getBoundingClientRect();
      const isOnScreen =
        rect.bottom > 0 &&
        rect.top < (window.innerHeight || document.documentElement.clientHeight);
      if (isOnScreen) {
        startTick();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handlePageHide = () => {
      saveCurrentTranslate(swiperRef.current);
    };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      saveCurrentTranslate(swiperRef.current);
      stopTick();
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
    router.push(
      `${localizePublicPath("/style", locale)}?style=${encodeURIComponent(preset.id)}`
    );
  };

  return (
    <div ref={containerRef} className="mb-8 overflow-x-hidden">
      <div className="mb-3 flex items-center justify-between gap-3 px-4 sm:px-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {tHome("stylePresetCarouselTitle")}
          </h2>
          {/* カルーセルは人気順上位のみ表示するため、その基準を薄く添える。 */}
          <p className="mt-0.5 text-xs text-slate-500">
            {tHome("stylePresetCarouselCaption")}
          </p>
        </div>
        {/* /style の「すべて見る」と同じ見た目。スタイル一覧ページ(/styles)へ遷移する。
            以前はホーム上で探索シートを開いていたが、同等のチップフィルターを持つ
            /styles に統一した(シート用の全プリセット+集計データの受け渡しを削減)。 */}
        <Link
          href={localizePublicPath("/styles", locale)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {t("styleBrowseAll")}
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      {/* Swiper's RTL mode flips translate semantics; this image rail is animated with LTR math. */}
      <div className="-mx-4 px-4" dir="ltr">
        <Swiper
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
            const wrapperEl = swiper.wrapperEl;
            if (!wrapperEl) {
              return;
            }
            wrapperEl.style.transitionDuration = "0ms";

            // Make sure Swiper has computed snapGrid before reading pitch.
            swiper.update();
            const slidePitch = getSlidePitchPx(swiper);
            const realWidthPx =
              slidePitch !== null ? presets.length * slidePitch : null;
            const savedTranslate = readSavedTranslate();
            // Default to the middle copy so the user has buffer in both
            // drag directions. Restored values are normalized into the
            // valid central band [-2*realWidthPx, 0].
            let initialTranslate =
              realWidthPx !== null ? -realWidthPx : 0;
            if (savedTranslate !== null && realWidthPx !== null) {
              let normalized = savedTranslate;
              while (normalized > 0) normalized -= realWidthPx;
              while (normalized < -2 * realWidthPx)
                normalized += realWidthPx;
              initialTranslate = normalized;
            }
            swiper.setTranslate(initialTranslate);

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
                  newBadgeLabel={
                    newPresetIdSet.has(preset.id)
                      ? t("styleNewBadge")
                      : undefined
                  }
                />
              </SwiperSlide>
            );
          })}
        </Swiper>
      </div>
      {/* /styles と共通の試着確認モーダル(サムネイルの実アスペクト比で表示)。 */}
      <StyleTryOnConfirmDialog
        preset={confirmingPreset}
        onOpenChange={handleDialogOpenChange}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
