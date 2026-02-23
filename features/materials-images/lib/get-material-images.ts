/**
 * フリー素材画像取得（next-cache-components: use cache）
 */

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MaterialPageImage } from "./schema";

/**
 * 指定ページの管理画像一覧を取得（キャッシュ付き）
 * createAdminClient使用: use cache内ではcookies()が使えないため
 */
async function getMaterialPageImagesCached(
  pageSlug: string
): Promise<MaterialPageImage[]> {
  "use cache";
  cacheTag(`materials-images-${pageSlug}`);
  cacheLife("minutes");

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("materials_images")
    .select("*")
    .eq("page_slug", pageSlug)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[getMaterialPageImages] Error:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    page_slug: row.page_slug,
    image_url: row.image_url,
    storage_path: row.storage_path,
    alt: row.alt,
    display_order: row.display_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export { getMaterialPageImagesCached as getMaterialPageImages };
