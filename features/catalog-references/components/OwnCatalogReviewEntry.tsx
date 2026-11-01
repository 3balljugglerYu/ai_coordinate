import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isInI2iCatalogAllowlist } from "@/lib/auth/i2i-catalog";
import { REVIEW_STATUS_PATH } from "../lib/review-status";
export async function OwnCatalogReviewEntry({userId}:{userId:string}){
  const client=await createClient();
  const [{data,error},allowed]=await Promise.all([
    client.from("generated_image_catalog_reviews").select("image_id").eq("user_id",userId).limit(1),isInI2iCatalogAllowlist(userId),
  ]);
  if(!allowed&&(error||!data?.length))return null;
  const t=await getTranslations("catalogReview");
  return <Link href={REVIEW_STATUS_PATH} className="mt-5 block rounded-xl border border-violet-200 bg-white p-4 font-semibold text-violet-900">{t("title")} →</Link>;
}
