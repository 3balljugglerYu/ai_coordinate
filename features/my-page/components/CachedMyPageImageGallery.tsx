import { CATALOG_REVIEW_IMAGES_TAG } from "@/features/catalog-references/lib/review-status";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyImagesServer } from "../lib/server-api";
import { MyPageImageGalleryClient } from "./MyPageImageGalleryClient";

interface CachedMyPageImageGalleryProps {
  userId: string;
}

export async function CachedMyPageImageGallery({
  userId,
}: CachedMyPageImageGalleryProps) {
  "use cache";
  cacheTag(`my-page-${userId}`, CATALOG_REVIEW_IMAGES_TAG);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const images = await getMyImagesServer(userId, "all", 20, 0, supabase);

  return <MyPageImageGalleryClient initialImages={images} currentUserId={userId} />;
}
