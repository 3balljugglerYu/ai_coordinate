import { cacheLife, cacheTag } from "next/cache";
import { getGeneratedImagesServer } from "../lib/server-database";
import { GeneratedImageGalleryClient } from "./GeneratedImageGalleryClient";
import type { GeneratedImageData } from "../types";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 4;

interface CachedGeneratedImageGalleryProps {
  userId: string;
}

/**
 * コーディネートページ用: 生成結果一覧（use cache でサーバーキャッシュ）
 */
export async function CachedGeneratedImageGallery({
  userId,
}: CachedGeneratedImageGalleryProps) {
  "use cache";
  cacheTag(`coordinate-${userId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const records = await getGeneratedImagesServer(
    userId,
    PAGE_SIZE,
    0,
    "coordinate",
    supabase
  );

  const initialImages: GeneratedImageData[] = records
    .map((record) => {
      if (!record.id) return null;
      return {
        id: record.id,
        url: record.image_url,
        is_posted: record.is_posted ?? false,
        prompt: record.prompt ?? "",
        createdAt: record.created_at,
        model: record.model ?? null,
        width: record.width ?? null,
        height: record.height ?? null,
        fromStock: Boolean(record.source_image_stock_id),
        preGenerationStoragePath: record.pre_generation_storage_path ?? null,
        showBeforeImage: record.show_before_image ?? true,
      } as GeneratedImageData;
    })
    .filter((img): img is GeneratedImageData => img !== null);

  return (
    <GeneratedImageGalleryClient initialImages={initialImages} />
  );
}
