"use client";

import { Card } from "@/components/ui/card";

const LOADING_PROGRESS_BAR_STYLE = {
  backgroundColor: "#10B981",
  filter: "saturate(1.1) brightness(1.05)",
};

const COMPLETED_PROGRESS_BAR_STYLE = {
  backgroundImage: "linear-gradient(90deg, #14b8a6, #10b981, #10b981)",
};

interface StyleGenerationStatusCardProps {
  title: string;
  message: string;
  liveMessage: string;
  hint: string;
  slowHint: string;
  progress: number;
  isLongWait: boolean;
  isComplete: boolean;
  prefersReducedMotion: boolean;
}

export function StyleGenerationStatusCard({
  title,
  message,
  liveMessage,
  hint,
  slowHint,
  progress,
  isLongWait,
  isComplete,
  prefersReducedMotion,
}: StyleGenerationStatusCardProps) {
  const footerText = isComplete ? hint : isLongWait ? slowHint : hint;
  const progressBarStyle = isComplete
    ? COMPLETED_PROGRESS_BAR_STYLE
    : LOADING_PROGRESS_BAR_STYLE;

  return (
    <Card
      className={`mt-4 overflow-hidden border-slate-200 p-4 shadow-sm ${
        isComplete
          ? "bg-gradient-to-br from-white via-emerald-50 to-teal-50/80"
          : "bg-gradient-to-br from-white via-slate-50 to-orange-50/70"
      }`}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {title}. {liveMessage}. {footerText}
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
              style={{ width: `${progress}%`, ...progressBarStyle }}
            />
          </div>
          <p className="text-xs leading-5 text-slate-500">{footerText}</p>
        </div>
      </div>
    </Card>
  );
}
