"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CatalogReviewCard } from "./CatalogReviewCard";
import { reviewStatusHref, type OwnCatalogReview } from "../lib/review-status";

/** 作者の画面だけに置く。毎回本人の権限で取得し、秘密の見本は受け取らない。 */
export function OwnCatalogReviewPanel({imageId,onReviewLoaded}:{imageId:string;onReviewLoaded?:(imageId:string,review:OwnCatalogReview|null|undefined)=>void}) {
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
  if(failed)return <Link href={reviewStatusHref(imageId)} className="block p-3 text-sm underline">{t("title")}</Link>;
  return review?<CatalogReviewCard key={`${review.imageId}:${review.status}`} review={review} compact/>:null;
}
