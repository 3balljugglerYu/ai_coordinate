import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getImageUrlFromStoragePath } from "@/features/posts/lib/utils";
import { CATALOG_REFERENCE_BUCKET } from "./reference-image-repository";

/**
 * 運営の審査ページで、審査待ち(pending)の見本つきの作品を読む。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 4)
 *
 * - 見本は非公開の置き場所にあるので、運営が見る間だけ使える URL(10分)を作る
 * - 承認前の作品から作った派生の作品(ADR-008)は、作品そのものに見本の情報が無いので、元の作品の見本を使う
 * - プロンプトは作品の秘密の表から読む(派生の作品で無ければ元の作品のもの)
 * - 見本がほかの作品の審査で作り直しになっていれば印を付ける(承認しても、その見本はもう使えない)
 * - 運営だけの操作なので service role で動かす
 */

const SIGNED_URL_SECONDS = 600;
const MAX_ITEMS = 50;

export interface PendingCatalogReview {
  imageId: string;
  userId: string;
  nickname: string | null;
  submittedAt: string | null;
  afterUrl: string | null;
  beforeUrl: string | null;
  referenceUrl: string | null;
  takes: string[];
  prompt: string | null;
  /** 承認前の作品から作った派生の作品か(見本は元の作品のもの) */
  derived: boolean;
  /** 見本がほかの作品の審査で作り直しになり、もう使えないか */
  referenceRejected: boolean;
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

function fail(message: string, error: { message: string }): never {
  console.error(`[catalog-reviews] ${message}:`, error.message);
  throw new Error("審査待ちの作品の取得に失敗しました");
}

export async function listPendingCatalogReviews(client?: SupabaseClient): Promise<PendingCatalogReview[]> {
  const supabase = getSupabase(client);

  const { data: reviews, error: reviewError } = await supabase
    .from("generated_image_catalog_reviews")
    .select("image_id, user_id, submitted_at")
    .eq("status", "pending")
    .order("submitted_at", { ascending: true })
    .limit(MAX_ITEMS);
  if (reviewError) fail("reviews", reviewError);
  const reviewRows = (reviews ?? []) as Array<{ image_id: string; user_id: string; submitted_at: string | null }>;
  if (reviewRows.length === 0) return [];

  const imageIds = reviewRows.map((row) => row.image_id);
  const { data: images, error: imageError } = await supabase
    .from("generated_images")
    .select("id, image_url, pre_generation_storage_path, source_post_id")
    .in("id", imageIds);
  if (imageError) fail("images", imageError);
  const imageById = new Map(
    ((images ?? []) as Array<{
      id: string;
      image_url: string | null;
      pre_generation_storage_path: string | null;
      source_post_id: string | null;
    }>).map((image) => [image.id, image]),
  );

  // 見本とプロンプトは、作品そのもの → 無ければ元の作品(派生) の順に探す
  const rootIds = [...new Set([...imageById.values()].map((image) => image.source_post_id).filter((id): id is string => !!id))];
  const lookupIds = [...new Set([...imageIds, ...rootIds])];

  const [secretsResult, promptsResult, profilesResult] = await Promise.all([
    supabase.from("generated_image_reference_secrets").select("image_id, reference_id, takes").in("image_id", lookupIds),
    supabase.from("generated_image_prompt_secrets").select("image_id, prompt").in("image_id", lookupIds),
    supabase
      .from("profiles")
      .select("user_id, nickname")
      .in("user_id", [...new Set(reviewRows.map((row) => row.user_id))]),
  ]);
  if (secretsResult.error) fail("reference secrets", secretsResult.error);
  if (promptsResult.error) fail("prompt secrets", promptsResult.error);
  if (profilesResult.error) fail("profiles", profilesResult.error);

  const secretByImage = new Map(
    ((secretsResult.data ?? []) as Array<{ image_id: string; reference_id: string; takes: string[] | null }>).map(
      (row) => [row.image_id, row],
    ),
  );
  const promptByImage = new Map(
    ((promptsResult.data ?? []) as Array<{ image_id: string; prompt: string | null }>).map((row) => [row.image_id, row.prompt]),
  );
  const nicknameByUser = new Map(
    ((profilesResult.data ?? []) as Array<{ user_id: string; nickname: string | null }>).map((row) => [row.user_id, row.nickname]),
  );

  const referenceIds = [...new Set([...secretByImage.values()].map((row) => row.reference_id))];
  const pathByReference = new Map<string, string>();
  const rejectedReferences = new Set<string>();
  if (referenceIds.length > 0) {
    const { data: references, error: referenceError } = await supabase
      .from("catalog_reference_images")
      .select("id, storage_path, rejected_at")
      .in("id", referenceIds);
    if (referenceError) fail("references", referenceError);
    for (const row of (references ?? []) as Array<{ id: string; storage_path: string; rejected_at: string | null }>) {
      pathByReference.set(row.id, row.storage_path);
      if (row.rejected_at) rejectedReferences.add(row.id);
    }
  }

  const signedUrlByPath = new Map<string, string>();
  const paths = [...pathByReference.values()];
  if (paths.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(CATALOG_REFERENCE_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (signError) fail("signed urls", signError);
    for (const row of (signed ?? []) as Array<{ path: string | null; signedUrl: string | null }>) {
      if (row.path && row.signedUrl) signedUrlByPath.set(row.path, row.signedUrl);
    }
  }

  return reviewRows.map((review) => {
    const image = imageById.get(review.image_id);
    const ownSecret = secretByImage.get(review.image_id);
    const rootId = image?.source_post_id ?? null;
    const secret = ownSecret ?? (rootId ? secretByImage.get(rootId) : undefined);
    const referencePath = secret ? pathByReference.get(secret.reference_id) : undefined;
    return {
      imageId: review.image_id,
      userId: review.user_id,
      nickname: nicknameByUser.get(review.user_id) ?? null,
      submittedAt: review.submitted_at,
      afterUrl: image?.image_url ?? null,
      beforeUrl: image?.pre_generation_storage_path
        ? getImageUrlFromStoragePath(image.pre_generation_storage_path)
        : null,
      referenceUrl: referencePath ? signedUrlByPath.get(referencePath) ?? null : null,
      takes: secret?.takes ?? [],
      prompt: promptByImage.get(review.image_id) ?? (rootId ? promptByImage.get(rootId) ?? null : null),
      derived: !ownSecret && !!rootId,
      referenceRejected: secret ? rejectedReferences.has(secret.reference_id) : false,
    };
  });
}
