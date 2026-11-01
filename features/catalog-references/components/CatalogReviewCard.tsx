"use client";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CatalogReferenceConsentSheet } from "./CatalogReferenceConsentSheet";
import { CatalogReviewProgress } from "./CatalogReviewProgress";
import { reviewStatusHref, type OwnCatalogReview } from "../lib/review-status";

const REASON_KEYS = {official_or_others_work:"catalogReviewReasonOfficialOrOthersWork",real_person:"catalogReviewReasonRealPerson",sexual_or_violent:"catalogReviewReasonSexualOrViolent",other:"catalogReviewReasonOther"} as const;
export function CatalogReviewCard({review, compact=false, onChanged}:{review:OwnCatalogReview;compact?:boolean;onChanged?:()=>void}) {
  const t = useTranslations("catalogReview");
  const nt = useTranslations("notifications");
  const [submitted,setSubmitted] = useState(false);
  const current = submitted && review.status === "not_submitted" ? {...review,status:"pending" as const} : review;
  const [guideOpen,setGuideOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState(false);
  async function submit() {
    if(busy) return;
    setBusy(true);setError(false);
    try {
      const response=await fetch("/api/catalog-references/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageId:current.imageId})});
      if(!response.ok) throw new Error();
      setSubmitted(true);onChanged?.();
    } catch {setError(true);} finally {setBusy(false);}
  }
  return <div className="space-y-3 rounded-xl border border-violet-100 bg-white p-3" data-testid="catalog-review-card">
    <p className="text-sm font-semibold">{t(`badge_${current.status}`)}</p>
    {current.status !== "rejected" ? <CatalogReviewProgress status={current.status}/> : null}
    {current.status==="pending"?<p className="text-sm text-gray-600">{t("waiting")}</p>:null}
    {current.status==="rejected"?<div className="space-y-2 rounded-lg bg-orange-50 p-3 text-sm">
      <p className="font-semibold">{t("rejectedTitle")}</p>
      {current.reasonCategory && Object.hasOwn(REASON_KEYS,current.reasonCategory)?<p>{nt(REASON_KEYS[current.reasonCategory])}</p>:null}
      {current.reason?<p className="whitespace-pre-wrap break-words">{current.reason}</p>:null}
      <p>{t("rejectedCannotPost")}</p>
      <button type="button" className="min-h-11 text-left underline" onClick={()=>setGuideOpen(true)}>{t("referenceGuide")}</button>
    </div>:null}
    {!current.available?<p className="text-sm text-gray-600">{t("unavailable")}</p>:<div className="flex flex-wrap gap-2">
      {current.status==="not_submitted"?<Button className="min-h-11" type="button" disabled={busy} onClick={()=>void submit()}>{busy?t("sending"):t("submit")}</Button>:null}
      {current.status==="approved" && !current.isPosted?<Button className="min-h-11" asChild><Link href={`/posts/new/${current.imageId}`}>{t("post")}</Link></Button>:null}
      {current.status==="approved" && current.isPosted?<span className="text-sm">{t("posted")}</span>:null}
      {current.status==="rejected"?<Button className="min-h-11" asChild variant="outline"><Link href={`/free?remake=${current.imageId}`}>{t("remake")}</Link></Button>:null}
    </div>}
    {current.status === "rejected" && current.available ? <p className="text-sm text-gray-600">{t("remakeHint")}</p> : null}
    {error?<p role="alert" className="text-sm text-red-700">{t("submitFailed")}</p>:null}
    {current.status === "rejected" ? <CatalogReferenceConsentSheet open={guideOpen} onOpenChange={setGuideOpen} onAgree={()=>setGuideOpen(false)} mode="view" showOnceNote={false}/> : null}
    {compact?<Link href={reviewStatusHref(current.imageId)} className="flex min-h-11 items-center text-sm underline">{t("title")}</Link>:null}
  </div>;
}
