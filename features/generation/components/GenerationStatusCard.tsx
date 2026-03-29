"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";

const LOADING_PROGRESS_BAR_STYLE = {
  backgroundColor: "#10B981",
  filter: "saturate(1.1) brightness(1.05)",
};

const COMPLETED_PROGRESS_BAR_STYLE = {
  backgroundImage: "linear-gradient(90deg, #14b8a6, #10b981, #10b981)",
};

const SMALL_PROGRESS_TRANSITION_MS = 700;
const MEDIUM_PROGRESS_TRANSITION_MS = 1200;
const LARGE_PROGRESS_TRANSITION_MS = 10000;

interface GenerationStatusCardProps {
  title: string;
  message: string;
  liveMessage: string;
  footerText: string;
  footerLiveText?: string;
  progress: number;
  progressTransitionDurationMs?: number;
  animateFromZeroOnMount?: boolean;
  isComplete: boolean;
  prefersReducedMotion: boolean;
}

export function GenerationStatusCard({
  title,
  message,
  liveMessage,
  footerText,
  footerLiveText,
  progress,
  progressTransitionDurationMs,
  animateFromZeroOnMount = false,
  isComplete,
  prefersReducedMotion,
}: GenerationStatusCardProps) {
  const progressBarStyle = isComplete
    ? COMPLETED_PROGRESS_BAR_STYLE
    : LOADING_PROGRESS_BAR_STYLE;
  const initialMountAnimationDoneRef = useRef(false);
  const [renderedProgress, setRenderedProgress] = useState(() =>
    prefersReducedMotion || !animateFromZeroOnMount ? progress : 0
  );
  const [previousProgress, setPreviousProgress] = useState(progress);
  const progressDelta = Math.abs(progress - previousProgress);

  useEffect(() => {
    setPreviousProgress(progress);
  }, [progress]);

  useEffect(() => {
    if (prefersReducedMotion || !animateFromZeroOnMount) {
      initialMountAnimationDoneRef.current = true;
      setRenderedProgress(progress);
      return;
    }

    if (!initialMountAnimationDoneRef.current) {
      const frameId = window.requestAnimationFrame(() => {
        initialMountAnimationDoneRef.current = true;
        setRenderedProgress(progress);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    setRenderedProgress(progress);
  }, [animateFromZeroOnMount, prefersReducedMotion, progress]);

  const fallbackTransitionDurationMs = prefersReducedMotion
    ? 0
    : progressDelta >= 40
      ? LARGE_PROGRESS_TRANSITION_MS
      : progressDelta >= 20
        ? MEDIUM_PROGRESS_TRANSITION_MS
        : SMALL_PROGRESS_TRANSITION_MS;
  const transitionDurationMs =
    progressTransitionDurationMs ?? fallbackTransitionDurationMs;

  return (
    <Card
      className={`mt-4 overflow-hidden border-slate-200 p-4 shadow-sm ${
        isComplete
          ? "bg-gradient-to-br from-white via-emerald-50 to-teal-50/80"
          : "bg-gradient-to-br from-white via-slate-50 to-orange-50/70"
      }`}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {title}. {liveMessage}. {footerLiveText ?? footerText}
      </p>

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p
            aria-hidden="true"
            className="min-h-[1.5rem] text-sm leading-6 text-slate-600"
          >
            {message}
            {prefersReducedMotion ? null : (
              <span className="ml-0.5 inline-block animate-pulse text-slate-400 motion-reduce:animate-none">
                |
              </span>
            )}
          </p>
        </div>

        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{
                width: `${renderedProgress}%`,
                transitionDuration: `${transitionDurationMs}ms`,
                ...progressBarStyle,
              }}
            />
          </div>
          <p className="text-xs leading-5 text-slate-500">{footerText}</p>
        </div>
      </div>
    </Card>
  );
}
