"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CatalogReviewStatusChip } from "./CatalogReviewStatusChip";
import { CatalogReviewCard } from "./CatalogReviewCard";
import { reviewStatusHref, type OwnCatalogReview } from "../lib/review-status";

/** 作者の画面だけに置く。毎回本人の権限で取得し、秘密の見本は受け取らない。 */
export function OwnCatalogReviewPanel({imageId,onReviewLoaded,presentation="details"}:{imageId:string;onReviewLoaded?:(imageId:string,review:OwnCatalogReview|null|undefined)=>void;presentation?:"details"|"thumbnail"}) {
  const t=useTranslations("catalogReview");
  const [review,setReview]=useState<OwnCatalogReview|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true;
    let readVersion=0;
    const controller=new AbortController();
    const read=async()=>{
      const currentRead=++readVersion;
      try {
        const res=await fetch(`/api/catalog-references/reviews?imageId=${encodeURIComponent(imageId)}`,{signal:controller.signal,cache:"no-store"});
        if(!res.ok) throw new Error();
        const data=await res.json();
        if(active && currentRead===readVersion){setReview(data.review);setFailed(false);onReviewLoaded?.(imageId,data.review);}
      }catch {if(active && currentRead===readVersion){setFailed(true);onReviewLoaded?.(imageId,undefined);}}
    };
    setReview(null);setFailed(false);void read();
    const resume=()=>{if(document.visibilityState!=="hidden")void read();};
    window.addEventListener("focus",resume);
    return ()=>{active=false;controller.abort();window.removeEventListener("focus",resume);};
  },[imageId,onReviewLoaded]);
  const thumbnailClass = "absolute bottom-0 left-2 z-10 inline-flex min-h-11 items-center";
  if(failed)return <Link href={reviewStatusHref(imageId)} onClick={event=>event.stopPropagation()} className={presentation==="thumbnail" ? `${thumbnailClass} rounded-md bg-white/95 px-2 text-xs underline` : "block p-3 text-sm underline"}>{t("title")}</Link>;
  if(presentation==="thumbnail") {
    if(!review)return null;
    const chip=<CatalogReviewStatusChip status={review.status}/>;
    return review.available
      ? <Link href={`/posts/${encodeURIComponent(imageId)}`} title={t("title")} className={thumbnailClass} onClick={event=>event.stopPropagation()}>{chip}</Link>
      : <span className={thumbnailClass} title={t("unavailable")}>{chip}</span>;
  }
  return review?<CatalogReviewCard key={`${review.imageId}:${review.status}`} review={review} compact/>:null;
}
