"use client";
import { useCallback, useState } from "react";
import type { OwnCatalogReview } from "./review-status";

/** 既存の投稿ボタンと審査パネルで、同じ取得結果を使う。最終的な投稿可否はサーバーでも検査する。 */
export function useCatalogReviewPosting() {
  const [blocked,setBlocked]=useState<Record<string,boolean>>({});
  const onReviewLoaded=useCallback((imageId:string,review:OwnCatalogReview|null|undefined)=>{
    const next=review===undefined || !!review && (!review.available || review.status !== "approved" || review.isPosted);
    setBlocked(previous=>previous[imageId]===next?previous:{...previous,[imageId]:next});
  },[]);
  const canPost=(imageId:string)=>blocked[imageId]===false;
  return {onReviewLoaded,canPost};
}
