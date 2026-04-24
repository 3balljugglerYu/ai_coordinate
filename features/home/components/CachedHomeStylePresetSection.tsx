import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { HomeStylePresetCarousel } from "./HomeStylePresetCarousel";

export async function CachedHomeStylePresetSection() {
  const presets = await getPublishedStylePresets();

  return <HomeStylePresetCarousel presets={presets} />;
}
