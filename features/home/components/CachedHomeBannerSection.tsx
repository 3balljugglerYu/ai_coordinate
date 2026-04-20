import { cacheLife, cacheTag } from "next/cache";
import { getPublicBanners } from "@/features/banners/lib/get-banners";
import { HomeBannerList } from "./HomeBannerList";

export async function CachedHomeBannerSection() {
  "use cache";
  cacheTag("banners");
  cacheLife("minutes");

  const banners = await getPublicBanners();

  return <HomeBannerList banners={banners} />;
}
