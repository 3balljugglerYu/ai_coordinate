import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import {
  applyCollectionUnlockGating,
  type CollectionUnlockContext,
} from "@/features/collections/lib/collection-unlock-gating";
import { resolveCollectionUnlockContext } from "@/features/collections/lib/collection-unlock-server";
import { createClient } from "@/lib/supabase/server";
import { HomeStylePresetCarousel } from "./HomeStylePresetCarousel";

// 解放ゲート対象が無い/未ログイン時に使う空コンテキスト(除去・解放判定とも no-op)。
const EMPTY_UNLOCK_CONTEXT: CollectionUnlockContext = {
  prerequisiteCompletedKeys: new Set(),
  distinctGeneratedByCategoryKey: new Map(),
};

/**
 * ホームの Style プリセットセクション。
 * admin は admin_only カテゴリも(公開前プレビュー用に)併せて表示する。
 * isAdminViewer / userId は呼び出し側で判定して渡す(ホーム page.tsx で getUser)。
 *
 * 解放ゲート(unlock gating)は /style と同様にここでも適用する。これをしないと、
 * 完走者限定・段階解放のカテゴリ(例: ぷち神)がホームでは全件表示され、ゲートが
 * 効かなくなる。ホームのカルーセルは locked 表示に未対応なので、未解放(locked)分は
 * 一覧から除外し、解放済みのプリセットだけを並べる。
 */
export async function CachedHomeStylePresetSection({
  isAdminViewer = false,
  userId = null,
}: {
  isAdminViewer?: boolean;
  userId?: string | null;
}) {
  const cachedPresets = await getPublishedStylePresets({
    includeAdminOnly: isAdminViewer,
  });

  // 解放ルール付きカテゴリが無ければ完全 no-op(authed client も作らない)。
  const hasGatedCategory = cachedPresets.some(
    (preset) => preset.category.unlockPrerequisiteKey != null,
  );
  const gated =
    userId && hasGatedCategory
      ? applyCollectionUnlockGating(
          cachedPresets,
          await resolveCollectionUnlockContext(
            cachedPresets,
            userId,
            await createClient(),
          ),
        )
      : applyCollectionUnlockGating(cachedPresets, EMPTY_UNLOCK_CONTEXT);

  // ホームは locked(未解放=シルエット)に未対応のため、未解放分は出さない。
  const presets = gated.filter((preset) => !preset.locked);

  return <HomeStylePresetCarousel presets={presets} />;
}
