/**
 * 公開バナー取得（next-cache-components: use cache）
 */

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HomeBanner } from "./schema";

/**
 * 公開中・表示期間内のバナー一覧を取得（キャッシュ付き）
 * createAdminClient使用: use cache内ではcookies()が使えないため
 */
async function getPublicBannersCached(): Promise<HomeBanner[]> {
  "use cache";
  cacheTag("banners");
  cacheLife("minutes");

  const supabase = createAdminClient();

  const now = new Date();

  const { data, error } = await supabase
    .from("banners")
    .select("id, image_url, link_url, alt, display_start_at, display_end_at")
    .eq("status", "published")
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[getPublicBanners] Error:", error);
    return [];
  }

  const filtered = (data ?? []).filter((row) => {
    if (row.display_start_at && new Date(row.display_start_at) > now) return false;
    if (row.display_end_at && new Date(row.display_end_at) <= now) return false;
    return true;
  });

  return filtered.map((row) => ({
    id: row.id,
    imageUrl: row.image_url,
    linkUrl: row.link_url,
    alt: row.alt,
  }));
}

export { getPublicBannersCached as getPublicBanners };
