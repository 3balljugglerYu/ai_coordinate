import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import {
  applyCollectionUnlockGating,
  type CollectionUnlockContext,
} from "@/features/collections/lib/collection-unlock-gating";
import { buildCollectionUnlockAnnouncements } from "@/features/collections/lib/collection-unlock-announcement";
import { resolveCollectionUnlockContext } from "@/features/collections/lib/collection-unlock-server";
import { categoryNeedsUnlockContext } from "@/features/collections/lib/collection-unlock";
import { PetitUnlockAnnouncer } from "@/features/collections/components/PetitUnlockAnnouncer";
import { buildPublicGeneratedImageUrl } from "@/features/collections/lib/public-mount-server-api";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  collectShelfPresetIds,
  deriveEventShelves,
  listActiveEventCategoryKeys,
} from "@/features/home/lib/derive-event-shelves";
import type { CompletedMountView } from "@/features/my-page/components/MyPageCollections";
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
      { includeAdminOnly: isAdminViewer },
    );
  }
  const gated = applyCollectionUnlockGating(cachedPresets, unlockContext);

  // 開催中のコレクション企画は専用の「企画棚」へ振り分ける(お着替えカルーセルの上)。
  // 棚は locked(次の1枚のシルエット)も表示するため、gated を locked 除外前に渡す。
  const now = new Date();

  // ✓済み判定用: 開催中企画カテゴリの「生成済みプリセットID集合」。
  // 解放方式(順次/一斉/前提付き)に依存せず厳密に判定するためIDで持つ。
  // 開催中企画がある場合のみ発行(通常時はクエリ増ゼロ)。失敗時は空集合=全てNEW表示に
  // フォールバックし、ホーム全体は壊さない。
  const generatedIdsByKey = new Map<string, ReadonlySet<string>>();
  const activeEventKeys = listActiveEventCategoryKeys(gated, now);
  if (userId && activeEventKeys.length > 0) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("image_jobs")
        .select("style_template_id, style_preset_category_key")
        .eq("user_id", userId)
        .eq("status", "succeeded")
        .in("style_preset_category_key", activeEventKeys)
        .not("style_template_id", "is", null)
        .limit(1000);
      if (!error) {
        for (const row of data ?? []) {
          const key = row.style_preset_category_key as string;
          const presetId = row.style_template_id as string;
          const set = generatedIdsByKey.get(key) as Set<string> | undefined;
          if (set) {
            set.add(presetId);
          } else {
            generatedIdsByKey.set(key, new Set([presetId]));
          }
        }
      }
    } catch {
      // 取得失敗は初日状態(全てNEW)で表示継続
    }
  }

  const eventShelves = deriveEventShelves(
    gated,
    unlockContext.distinctGeneratedByCategoryKey,
    generatedIdsByKey,
    now,
  );
  const shelfPresetIds = collectShelfPresetIds(eventShelves);

  // お着替えカルーセル: 棚に出した企画プリセットは除外して重複表示を避ける。
  // locked(未解放=シルエット)は従来どおりカルーセルには出さない。
  const presets = gated.filter(
    (preset) => !preset.locked && !shelfPresetIds.has(preset.id),
  );

  // 全コンプ済み棚の🎉カードには、マイページと同じ「本人の完成台紙サムネ」を出す。
  // 完走済み棚がある場合のみ対象カテゴリに絞って取得する(通常時はクエリ増ゼロを維持)。
  const completedMountByKey = new Map<string, CompletedMountView>();
  const completedKeys = eventShelves
    .filter((shelf) => shelf.isCompleted)
    .map((shelf) => shelf.categoryKey);
  if (userId && completedKeys.length > 0) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("collection_completions")
      .select(
        "id, category_key, mount_image_path, preset_categories(display_name_ja, mount_template_width, mount_template_height, completion_view_mode)",
      )
      .eq("user_id", userId)
      .eq("mount_status", "completed")
      .in("category_key", completedKeys);
    for (const row of data ?? []) {
      const mountImageUrl = buildPublicGeneratedImageUrl(
        (row.mount_image_path as string | null) ?? null,
      );
      if (!mountImageUrl) continue;
      const cat = (row as { preset_categories?: unknown }).preset_categories;
      const catRecord = (Array.isArray(cat) ? cat[0] : cat) as
        | {
            display_name_ja?: string;
            mount_template_width?: number | null;
            mount_template_height?: number | null;
            completion_view_mode?: string | null;
          }
        | undefined;
      completedMountByKey.set(row.category_key as string, {
        completionId: row.id as string,
        categoryKey: row.category_key as string,
        displayName: catRecord?.display_name_ja ?? "",
        mountImageUrl,
        mountTemplateWidth: catRecord?.mount_template_width ?? null,
        mountTemplateHeight: catRecord?.mount_template_height ?? null,
        completionViewMode:
          catRecord?.completion_view_mode === "book" ? "book" : "mount",
      });
    }
  }

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
          completedMount={completedMountByKey.get(shelf.categoryKey) ?? null}
        />
      ))}
      <HomeStylePresetCarousel presets={presets} />
    </>
  );
}
