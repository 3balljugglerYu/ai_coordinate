"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CatalogReviewStatus } from "../lib/review-status";

const STATUS_STYLES = {
  not_submitted: { badge: "border-slate-200 bg-slate-50/95 text-slate-600", dot: "bg-slate-400" },
  pending: { badge: "border-sky-100 bg-sky-50/95 text-sky-800", dot: "bg-sky-500" },
  rejected: { badge: "border-rose-100 bg-rose-50/95 text-rose-800", dot: "bg-rose-400" },
  approved: { badge: "border-emerald-100 bg-emerald-50/95 text-emerald-800", dot: "bg-emerald-500" },
} as const;

/** マイページ・生成結果・作品詳細で共通の審査状態。 */
export function CatalogReviewStatusChip({status, className}: {status: CatalogReviewStatus; className?: string}) {
  const t = useTranslations("catalogReview");
  if (!Object.hasOwn(STATUS_STYLES, status)) return null;
  const palette = STATUS_STYLES[status];
  return (
    <Badge variant="outline" className={cn("h-6 gap-1.5 px-2 text-xs font-medium shadow-sm backdrop-blur-sm", palette.badge, className)}>
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", palette.dot)} />
      {t(`badge_${status}`)}
    </Badge>
  );
}
