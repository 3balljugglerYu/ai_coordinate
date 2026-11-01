import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
import { REVIEW_STATUSES, type OwnCatalogReview, type CatalogReviewStatus } from "./review-status";
import type { CatalogReviewReasonCategory } from "./review-reasons";

// RLSで本人だけが読める表。明示的な本人フィルターも必ず付け、見本・秘密の表は結合しない。
const COLUMNS = "image_id,status,reason_category,reason,updated_at,image:generated_images!inner(image_url,storage_path_thumb,is_posted,moderation_status)";
type Row = { image_id: string; status: CatalogReviewStatus; reason_category: CatalogReviewReasonCategory | null; reason: string | null; updated_at: string; image: {image_url: string; storage_path_thumb: string | null; is_posted: boolean; moderation_status: string} | {image_url: string; storage_path_thumb: string | null; is_posted: boolean; moderation_status: string}[] };
function toReview(row: Row): OwnCatalogReview {
  const image = Array.isArray(row.image) ? row.image[0] : row.image;
  return { imageId: row.image_id, status: row.status, reasonCategory: row.reason_category, reason: row.reason,
    updatedAt: row.updated_at, imageUrl: image?.moderation_status === "visible" ? getPostThumbUrl(image) : null,
    isPosted: image?.is_posted ?? false, available: image?.moderation_status === "visible" };
}
export async function getOwnCatalogReview(client: SupabaseClient, userId: string, imageId: string): Promise<OwnCatalogReview | null> {
  const { data, error } = await client.from("generated_image_catalog_reviews").select(COLUMNS)
    .eq("user_id", userId).eq("image_id", imageId).maybeSingle();
  if (error) throw new Error("Review read failed");
  if (!data || !REVIEW_STATUSES.includes(data.status as CatalogReviewStatus)) return null;
  return toReview(data as unknown as Row);
}
// 今やることがある順。公開済みは最後。ページをまたいでもこの順を維持する。
const BUCKETS: {status: CatalogReviewStatus; posted?: boolean}[] = [
  {status:"rejected"}, {status:"approved",posted:false}, {status:"not_submitted"}, {status:"pending"}, {status:"approved",posted:true},
];
export async function listOwnCatalogReviews(client: SupabaseClient, userId: string, cursor = "0:0") {
  const [bucketStart, offsetStart] = cursor.split(":").map(Number);
  const items: OwnCatalogReview[] = [];
  for (let bucket = bucketStart; bucket < BUCKETS.length; bucket++) {
    const offset = bucket === bucketStart ? offsetStart : 0;
    const remaining = 20 - items.length;
    let query = client.from("generated_image_catalog_reviews").select(COLUMNS).eq("user_id", userId)
      .eq("status", BUCKETS[bucket].status).order("updated_at", {ascending:false}).order("image_id", {ascending:true});
    if (BUCKETS[bucket].posted !== undefined) query = query.eq("image.is_posted", BUCKETS[bucket].posted);
    const {data,error} = await query.range(offset, offset + remaining);
    if (error) throw new Error("Review list failed");
    const rows = (data ?? []) as unknown as Row[];
    items.push(...rows.slice(0,remaining).map(toReview));
    if (rows.length > remaining) return {items, nextCursor:`${bucket}:${offset + remaining}`};
    if (items.length === 20) return {items, nextCursor: bucket + 1 < BUCKETS.length ? `${bucket+1}:0` : null};
  }
  return {items, nextCursor:null};
}
