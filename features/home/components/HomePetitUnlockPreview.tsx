import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { buildCollectionUnlockAnnouncements } from "@/features/collections/lib/collection-unlock-announcement";
import { PetitUnlockAnnouncer } from "@/features/collections/components/PetitUnlockAnnouncer";

/**
 * 開発/E2E 専用: 解放お知らせ(初回バナー/段階モーダル)を URL クエリで強制表示するプレビュー。
 *
 * 実際の解放対象カテゴリ(admin_only 含む)を取得し、「前提カテゴリ完走済み + 段階解放途中」
 * という擬似コンテキストで実データの announcement を組み立てる。これにより本番と同じ
 * コンポーネント・実サムネで見た目を確認できる。本番導線では呼ばれない
 * (page.tsx 側で NODE_ENV / PLAYWRIGHT_E2E ゲート済み)。
 */
export async function HomePetitUnlockPreview({
  mode,
}: {
  mode: "initial" | "drip";
}) {
  const presets = await getPublishedStylePresets({ includeAdminOnly: true });

  // 前提カテゴリを「完走済み」と仮定し、distinct 生成数を mode に応じて与える擬似コンテキスト。
  //  - initial: distinct=0 → 解放数 batch(=最初の解放)
  //  - drip: distinct=2 → さらに次の batch が解放された状態
  const prerequisiteCompletedKeys = new Set<string>();
  const distinctGeneratedByCategoryKey = new Map<string, number>();
  const distinct = mode === "drip" ? 2 : 0;
  for (const preset of presets) {
    const prerequisite = preset.category.unlockPrerequisiteKey;
    if (!prerequisite) continue;
    prerequisiteCompletedKeys.add(prerequisite);
    distinctGeneratedByCategoryKey.set(preset.category.key, distinct);
  }

  const announcements = buildCollectionUnlockAnnouncements(presets, {
    prerequisiteCompletedKeys,
    distinctGeneratedByCategoryKey,
  });
  if (announcements.length === 0) return null;

  return <PetitUnlockAnnouncer announcements={announcements} previewMode={mode} />;
}
