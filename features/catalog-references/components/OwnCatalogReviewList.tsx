"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CatalogReviewCard } from "./CatalogReviewCard";
import type { OwnCatalogReview } from "../lib/review-status";

export function OwnCatalogReviewList({imageId}:{imageId?:string}) {
  const t=useTranslations("catalogReview");
  const requestId=useRef(0);
  const targetRequestId=useRef(0);
  const invalidate=useCallback(()=>{requestId.current++;targetRequestId.current++;},[]);
  const [target,setTarget]=useState<OwnCatalogReview|null>(null);
  const [items,setItems]=useState<OwnCatalogReview[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);
  const [retryCursor,setRetryCursor]=useState<string|null>(null);
  const load=useCallback(async(next:string|null=null)=>{
    const currentRequest=++requestId.current;
    setLoading(true);setFailed(false);
    try {
      const response=await fetch(`/api/catalog-references/reviews${next?`?cursor=${encodeURIComponent(next)}`:""}`,{cache:"no-store"});
      if(!response.ok)throw new Error();
      const data=await response.json() as {items:OwnCatalogReview[];nextCursor:string|null};
      if(currentRequest!==requestId.current)return;
      setItems(previous=>next?[...new Map([...previous,...data.items].map(item=>[item.imageId,item])).values()]:data.items);
      setCursor(data.nextCursor);
    }catch{if(currentRequest===requestId.current){setFailed(true);setRetryCursor(next);}}finally{if(currentRequest===requestId.current)setLoading(false);}
  },[]);
  const [targetFailed,setTargetFailed]=useState(false);
  const loadTarget=useCallback(async(signal?:AbortSignal)=>{
    const currentRequest=++targetRequestId.current;
    const id=imageId;
    setTarget(null);
    if(!id){setTargetFailed(false);return;}
    setTargetFailed(false);
    try {
      const response=await fetch(`/api/catalog-references/reviews?imageId=${encodeURIComponent(id)}`,{cache:"no-store",signal});
      if(!response.ok)throw new Error();
      const data=await response.json() as {review:OwnCatalogReview|null};
      if(signal?.aborted || currentRequest!==targetRequestId.current)return;
      setTarget(data.review);setTargetFailed(!data.review);
    }catch{if(!signal?.aborted && currentRequest===targetRequestId.current)setTargetFailed(true);}
  },[imageId]);
  const refresh=useCallback(()=>{void load();void loadTarget();},[load,loadTarget]);
  useEffect(()=>{
    const controller=new AbortController();
    void load();void loadTarget(controller.signal);
    const resume=()=>{if(document.visibilityState!=="hidden")refresh();};
    window.addEventListener("focus",resume);
    return ()=>{invalidate();controller.abort();window.removeEventListener("focus",resume);};
  },[load,loadTarget,refresh,invalidate]);
  const targetId=target?.imageId;
  useEffect(()=>{if(targetId)document.getElementById(`review-${targetId}`)?.focus();},[targetId]);
  const displayed=target?[target,...items.filter(item=>item.imageId!==target.imageId)]:items;
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-gray-600">{t("order")}</p><Button className="min-h-11" variant="outline" disabled={loading} onClick={refresh}>{t("refresh")}</Button></div>
    {displayed.map(item=><article key={`${item.imageId}:${item.status}`} id={`review-${item.imageId}`} tabIndex={-1} className="scroll-mt-24 rounded-2xl border bg-white p-3 sm:flex sm:items-start sm:gap-4">
      {item.imageUrl?<Link href={`/posts/${item.imageId}`} className="mb-3 block shrink-0 sm:mb-0"><Image src={item.imageUrl} alt={t("imageAlt")} width={120} height={160} sizes="120px" unoptimized className="h-40 w-30 rounded-lg object-cover"/></Link>:null}
      <div className="min-w-0 flex-1"><CatalogReviewCard review={item} onChanged={refresh}/></div>
    </article>)}
    {targetFailed?<div role="alert"><p>{t("loadFailed")}</p><Button className="min-h-11" onClick={()=>void loadTarget()}>{t("retry")}</Button></div>:null}
    {loading?<p role="status">{t("loading")}</p>:null}
    {failed?<div role="alert"><p>{t("loadFailed")}</p><Button className="min-h-11" disabled={loading} onClick={()=>void load(retryCursor)}>{t("retry")}</Button></div>:null}
    {!loading&&!failed&&!targetFailed&&displayed.length===0?<p>{t("empty")}</p>:null}
    {!loading&&!failed&&cursor?<Button className="min-h-11" variant="outline" onClick={()=>void load(cursor)}>{t("more")}</Button>:null}
  </div>;
}
