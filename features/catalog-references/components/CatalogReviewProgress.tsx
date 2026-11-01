"use client";
import { useTranslations } from "next-intl";
import type { CatalogReviewStatus } from "../lib/review-status";

export function CatalogReviewProgress({status}:{status:CatalogReviewStatus | "creating"}) {
  const t = useTranslations("catalogReview");
  const active = {creating:0,not_submitted:1,pending:2,approved:3,rejected:1}[status];
  return <ol aria-label={t("progress")} className="grid grid-cols-4 gap-1 text-center text-xs">
    {(["create","submit","pending","approved"] as const).map((step,index)=><li key={step} aria-current={index===active?"step":undefined}
      className={`rounded-lg px-1 py-2 ${index===active?"bg-violet-100 font-bold text-violet-900":"bg-gray-100 text-gray-600"}`}>
      <span className="block">{index+1}</span>{t(step)}</li>)}
  </ol>;
}
