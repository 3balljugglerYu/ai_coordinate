import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { HomeStylePresetCarousel } from "./HomeStylePresetCarousel";

/**
 * ホームの Style プリセットセクション。
 * admin は admin_only カテゴリも(公開前プレビュー用に)併せて表示する。
 * isAdminViewer は呼び出し側で判定して渡す(ホーム page.tsx で getUser → isAdminViewer)。
 */
export async function CachedHomeStylePresetSection({
  isAdminViewer = false,
}: {
  isAdminViewer?: boolean;
}) {
  const presets = await getPublishedStylePresets({
    includeAdminOnly: isAdminViewer,
  });

  return <HomeStylePresetCarousel presets={presets} />;
}
