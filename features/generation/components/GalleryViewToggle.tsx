"use client";

import { LayoutGrid, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CoordinateGalleryView } from "../lib/gallery-view-preference";

interface GalleryViewToggleProps {
  value: CoordinateGalleryView;
  onChange: (next: CoordinateGalleryView) => void;
}

/**
 * 「生成結果一覧」のグリッド／リスト表示を切り替える 2 連トグル。
 */
export function GalleryViewToggle({
  value,
  onChange,
}: GalleryViewToggleProps) {
  const t = useTranslations("coordinate");

  return (
    <div
      role="group"
      aria-label={t("galleryViewToggleLabel")}
      className="inline-flex items-center rounded-md border bg-white p-0.5"
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-pressed={value === "grid"}
        aria-label={t("galleryViewGrid")}
        onClick={() => onChange("grid")}
        className={cn(
          "h-7 px-2",
          value === "grid"
            ? "bg-purple-100 text-purple-700 hover:bg-purple-100"
            : "text-gray-600",
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="ml-1 text-xs">{t("galleryViewGrid")}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-pressed={value === "list"}
        aria-label={t("galleryViewList")}
        onClick={() => onChange("list")}
        className={cn(
          "h-7 px-2",
          value === "list"
            ? "bg-purple-100 text-purple-700 hover:bg-purple-100"
            : "text-gray-600",
        )}
      >
        <List className="h-3.5 w-3.5" />
        <span className="ml-1 text-xs">{t("galleryViewList")}</span>
      </Button>
    </div>
  );
}
