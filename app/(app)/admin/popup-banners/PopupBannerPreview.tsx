"use client";

import { useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";

interface PreviewPopupBanner {
  imageUrl: string;
  alt: string;
  linkUrl: string | null;
  showOnceOnly: boolean;
}

interface PopupBannerPreviewProps {
  banner: PreviewPopupBanner;
}

export function PopupBannerPreview({ banner }: PopupBannerPreviewProps) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("mobile");

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setViewport("mobile")}
          className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            viewport === "mobile"
              ? "bg-violet-100 text-violet-800"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          モバイル
        </button>
        <button
          type="button"
          onClick={() => setViewport("desktop")}
          className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            viewport === "desktop"
              ? "bg-violet-100 text-violet-800"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          デスクトップ
        </button>
      </div>

      <div
        className={`rounded-2xl bg-slate-900/90 p-4 ${
          viewport === "mobile" ? "max-w-[360px]" : "max-w-[520px]"
        }`}
      >
        <div className="mx-auto flex flex-col items-center gap-3">
          <div className="relative w-full max-w-[280px] overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl">
            <div className="relative aspect-[3/4]">
              <Image
                src={banner.imageUrl}
                alt={banner.alt}
                fill
                className="object-cover"
                sizes="280px"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {banner.linkUrl ? (
              <Badge className="bg-white/90 text-slate-900 hover:bg-white">
                リンクあり
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-white/30 bg-transparent text-white"
              >
                リンクなし
              </Badge>
            )}
            {banner.showOnceOnly && (
              <Badge className="bg-emerald-400/90 text-emerald-950 hover:bg-emerald-400">
                次回から非表示対応
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
