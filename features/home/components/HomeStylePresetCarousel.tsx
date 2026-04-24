"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

import "swiper/css";
import "swiper/css/free-mode";

interface HomeStylePresetCarouselProps {
  presets: StylePresetPublicSummary[];
}

const AUTOPLAY_SPEED_MS = 6000;
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const pauseAutoplay = () => {
      swiperRef.current?.autoplay?.pause();
    };

    const resumeAutoplay = () => {
      const swiper = swiperRef.current;
      if (!swiper?.autoplay) {
        return;
      }
      swiper.autoplay.resume();
    };

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        if (entry.isIntersecting && !document.hidden) {
          resumeAutoplay();
        } else {
          saveCurrentTranslate(swiperRef.current);
          pauseAutoplay();
        }
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(container);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveCurrentTranslate(swiperRef.current);
        pauseAutoplay();
        return;
      }
      const rect = container.getBoundingClientRect();
      const isOnScreen =
        rect.bottom > 0 &&
        rect.top < (window.innerHeight || document.documentElement.clientHeight);
      if (isOnScreen) {
        resumeAutoplay();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handlePageHide = () => {
      saveCurrentTranslate(swiperRef.current);
    };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      saveCurrentTranslate(swiperRef.current);
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  if (presets.length === 0) {
    return null;
  }

  const handleSelect = (presetId: string) => {
    saveCurrentTranslate(swiperRef.current);
    router.push(`/style?style=${encodeURIComponent(presetId)}`);
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
            // Always clear the wrapper transition first to defend against
            // Next.js Router Cache preserving the prior 6s transition,
            // which would animate the upcoming translate for 6s.
            wrapperEl.style.transitionDuration = "0ms";

            // Restore prior position from sessionStorage so the carousel
            // resumes where the user left off.
            const savedTranslate = readSavedTranslate();
            if (savedTranslate !== null && savedTranslate <= 0) {
              swiper.setTranslate(savedTranslate);
              swiper.update();
            }

            wrapperEl.style.transform = `translate3d(${swiper.translate}px, 0, 0)`;
            void wrapperEl.offsetHeight;
            wrapperEl.style.transitionDuration = "";
          }}
          modules={[Autoplay, FreeMode]}
          slidesPerView="auto"
          spaceBetween={12}
          loop
          speed={AUTOPLAY_SPEED_MS}
          autoplay={{
            delay: 0,
            disableOnInteraction: false,
            pauseOnMouseEnter: false,
          }}
          freeMode={{ enabled: true, momentum: true, momentumRatio: 0.4 }}
          grabCursor
          allowTouchMove
          observer
          observeParents
          className="!overflow-visible"
        >
          {presets.map((preset) => (
            <SwiperSlide key={preset.id} style={{ width: "auto" }}>
              <StylePresetPreviewCard
                preset={preset}
                alt={t("styleCardAlt", { name: preset.title })}
                onClick={() => handleSelect(preset.id)}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  );
}
