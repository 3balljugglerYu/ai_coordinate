import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG_REFERENCE_TAKES } from "@/shared/generation/catalog-reference";
import type { CatalogReferenceTake } from "@/shared/generation/catalog-reference";

/** 本人の作り直し対象だけ。見本自体のid・URL・場所は返さず、古い見本を再利用させない。 */
export async function getCatalogRemake(client: SupabaseClient, admin: SupabaseClient, userId: string, imageId: string) {
  const {data:review,error:reviewError}=await client.from("generated_image_catalog_reviews")
    .select("status").eq("user_id",userId).eq("image_id",imageId).maybeSingle();
  if(reviewError)throw new Error("Review unavailable");
  if(review?.status!=="rejected")return null;
  const {data:image,error:imageError}=await client.from("generated_images").select("id,source_post_id,generation_type,moderation_status")
    .eq("user_id",userId).eq("id",imageId).maybeSingle();
  if(imageError)throw new Error("Image unavailable");
  if(!image||image.moderation_status!=="visible"||image.generation_type!=="free")return null;
  const rootId=image.source_post_id as string|null;
  if(rootId){
    const {data:root,error}=await client.from("generated_images").select("id").eq("id",rootId).eq("user_id",userId).maybeSingle();
    if(error)throw new Error("Source unavailable");
    if(!root)return null;
  }
  const sourceId=rootId??imageId;
  const [reference,prompt]=await Promise.all([
    admin.from("generated_image_reference_secrets").select("takes").eq("image_id",sourceId).maybeSingle(),
    admin.from("generated_image_prompt_secrets").select("prompt").eq("image_id",sourceId).maybeSingle(),
  ]);
  if(reference.error||prompt.error)throw new Error("Remake unavailable");
  if(!reference.data||!prompt.data||typeof prompt.data.prompt!=="string")return null;
  const rawTakes=reference.data.takes;
  const takes=CATALOG_REFERENCE_TAKES.filter(key=>Array.isArray(rawTakes)&&rawTakes.includes(key));
  if(!takes.length)return null;
  return {prompt:prompt.data.prompt,takes:takes as CatalogReferenceTake[]};
}
