"use client";

import { useState } from "react";
import { HomeBannerCard } from "@/features/home/components/HomeBannerCard";
import type { HomeBanner } from "@/features/banners/lib/schema";

interface BannerPreviewProps {
  banner: HomeBanner;
}

export function BannerPreview({ banner }: BannerPreviewProps) {
  const [view, setView] = useState<"pc" | "mobile">("pc");

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView("pc")}
          className={`px-4 py-2 text-sm font-medium rounded-lg min-h-[44px] cursor-pointer transition-colors ${
            view === "pc"
              ? "bg-violet-100 text-violet-800"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
          aria-pressed={view === "pc"}
          aria-label="PC表示"
        >
          PC
        </button>
        <button
          type="button"
          onClick={() => setView("mobile")}
          className={`px-4 py-2 text-sm font-medium rounded-lg min-h-[44px] cursor-pointer transition-colors ${
            view === "mobile"
              ? "bg-violet-100 text-violet-800"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
          aria-pressed={view === "mobile"}
          aria-label="モバイル表示"
        >
          モバイル
        </button>
      </div>
      <div
        className={`rounded-lg border border-slate-200 bg-white p-4 ${
          view === "mobile" ? "max-w-[375px]" : "w-full"
        }`}
      >
        <HomeBannerCard banner={banner} />
      </div>
    </div>
  );
}
