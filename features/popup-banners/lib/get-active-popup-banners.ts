import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActivePopupBanner } from "./schema";

async function getActivePopupBannersCached(): Promise<ActivePopupBanner[]> {
  "use cache";
  cacheTag("popup-banners");
  cacheLife("minutes");

  const supabase = createAdminClient();
  const now = new Date();

  const { data, error } = await supabase
    .from("popup_banners")
    .select(
      "id, image_url, link_url, alt, show_once_only, display_order, display_start_at, display_end_at"
    )
    .eq("status", "published")
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[getActivePopupBanners] Error:", error);
    return [];
  }

  return (data ?? [])
    .filter((banner) => {
      if (banner.display_start_at && new Date(banner.display_start_at) > now) {
        return false;
      }
      if (banner.display_end_at && new Date(banner.display_end_at) <= now) {
        return false;
      }
      return true;
    })
    .map((banner) => ({
      id: banner.id,
      imageUrl: banner.image_url,
      linkUrl: banner.link_url,
      alt: banner.alt,
      showOnceOnly: banner.show_once_only,
      displayOrder: banner.display_order,
    }));
}

export { getActivePopupBannersCached as getActivePopupBanners };
