"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export interface ImageLightboxSlide {
  url: string;
  label: string;
}

interface ImageLightboxDialogProps {
  slides: ImageLightboxSlide[];
  index: number | null;
  onIndexChange: (next: number | null) => void;
  prevLabel: string;
  nextLabel: string;
}

export function ImageLightboxDialog({
  slides,
  index,
  onIndexChange,
  prevLabel,
  nextLabel,
}: ImageLightboxDialogProps) {
  useEffect(() => {
    if (index === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onIndexChange(
          ((index - 1) + slides.length) % slides.length
        );
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onIndexChange((index + 1) % slides.length);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, slides.length, onIndexChange]);

  const goPrev = () => {
    if (index === null || slides.length === 0) return;
    onIndexChange(((index - 1) + slides.length) % slides.length);
  };
  const goNext = () => {
    if (index === null || slides.length === 0) return;
    onIndexChange((index + 1) % slides.length);
  };

  return (
    <Dialog
      open={index !== null}
      onOpenChange={(next) => {
        if (!next) onIndexChange(null);
      }}
    >
      <DialogContent className="max-w-4xl bg-black/95 p-2 sm:p-4">
        {index !== null && slides[index] && (
          <div className="relative flex max-h-[85vh] flex-col items-center justify-center">
            {slides.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label={prevLabel}
                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2 text-white shadow-md transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:p-3"
                >
                  <ChevronLeft aria-hidden="true" className="size-6 sm:size-8" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label={nextLabel}
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2 text-white shadow-md transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:p-3"
                >
                  <ChevronRight aria-hidden="true" className="size-6 sm:size-8" />
                </button>
              </>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slides[index].url}
              alt={slides[index].label}
              className="max-h-[80vh] w-auto max-w-full object-contain"
            />

            <div className="mt-2 flex items-center justify-center gap-3 text-xs text-white/80">
              <span className="font-medium">{slides[index].label}</span>
              {slides.length > 1 && <span aria-hidden="true">·</span>}
              {slides.length > 1 && (
                <span className="tabular-nums">
                  {index + 1} / {slides.length}
                </span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
