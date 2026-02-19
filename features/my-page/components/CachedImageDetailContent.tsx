import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { getImageDetailServer } from "../lib/server-api";
import { ImageDetailPageClient } from "./ImageDetailPageClient";
import { createAdminClient } from "@/lib/supabase/admin";

interface CachedImageDetailContentProps {
  userId: string;
  imageId: string;
}

/**
 * マイページ画像詳細用（use cache でサーバーキャッシュ）
 */
export async function CachedImageDetailContent({
  userId,
  imageId,
}: CachedImageDetailContentProps) {
  "use cache";
  cacheTag(`my-page-image-${userId}-${imageId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const image = await getImageDetailServer(userId, imageId, supabase);

  if (!image) {
    notFound();
  }

  return <ImageDetailPageClient image={image} />;
}
