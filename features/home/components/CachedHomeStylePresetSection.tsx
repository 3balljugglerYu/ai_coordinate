import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import {
  applyCollectionUnlockGating,
  type CollectionUnlockContext,
} from "@/features/collections/lib/collection-unlock-gating";
import { buildCollectionUnlockAnnouncements } from "@/features/collections/lib/collection-unlock-announcement";
import { resolveCollectionUnlockContext } from "@/features/collections/lib/collection-unlock-server";
import { categoryNeedsUnlockContext } from "@/features/collections/lib/collection-unlock";
import { PetitUnlockAnnouncer } from "@/features/collections/components/PetitUnlockAnnouncer";
import { createClient } from "@/lib/supabase/server";
import {
  collectShelfPresetIds,
  deriveEventShelves,
} from "@/features/home/lib/derive-event-shelves";
import { HomeEventShelfSection } from "./HomeEventShelfSection";
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

  // 解放ゲート対象カテゴリ(前提カテゴリ付き or sequential)が無ければ完全 no-op(authed client も作らない)。
  const hasGatedCategory = cachedPresets.some((preset) =>
    categoryNeedsUnlockContext(preset.category),
  );
  let unlockContext: CollectionUnlockContext = EMPTY_UNLOCK_CONTEXT;
  if (userId && hasGatedCategory) {
    unlockContext = await resolveCollectionUnlockContext(
      cachedPresets,
      userId,
      await createClient(),
    );
  }
  const gated = applyCollectionUnlockGating(cachedPresets, unlockContext);

  // 開催中のコレクション企画は専用の「企画棚」へ振り分ける(お着替えカルーセルの上)。
  // 棚は locked(次の1枚のシルエット)も表示するため、gated を locked 除外前に渡す。
  const now = new Date();
  const eventShelves = deriveEventShelves(
    gated,
    unlockContext.distinctGeneratedByCategoryKey,
    now,
  );
  const shelfPresetIds = collectShelfPresetIds(eventShelves);

  // お着替えカルーセル: 棚に出した企画プリセットは除外して重複表示を避ける。
  // locked(未解放=シルエット)は従来どおりカルーセルには出さない。
  const presets = gated.filter(
    (preset) => !preset.locked && !shelfPresetIds.has(preset.id),
  );

  // 解放お知らせ(初回バナー / 段階解放モーダル)。解放コンテキストはここで解決済みなので
  // 二重取得を避けて流用する。前提未完走・ゲートなしなら空配列(= 何も出ない)。
  const unlockAnnouncements = buildCollectionUnlockAnnouncements(
    cachedPresets,
    unlockContext,
  );

  return (
    <>
      {unlockAnnouncements.length > 0 && (
        <PetitUnlockAnnouncer announcements={unlockAnnouncements} />
      )}
      {eventShelves.map((shelf) => (
        <HomeEventShelfSection
          key={shelf.categoryKey}
          shelf={shelf}
          nowIso={now.toISOString()}
        />
      ))}
      <HomeStylePresetCarousel presets={presets} />
    </>
  );
}
