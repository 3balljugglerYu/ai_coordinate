import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPublicGeneratedImageUrl } from "./public-mount-server-api";
import {
  parseNormalizedRect,
  parseNormalizedSlots,
  type NormalizedSlotRect,
} from "./mount-layouts";
import { getRepresentativeImagesForCategory } from "./representative-images";
import type {
  CollectionProgress,
  CollectionProgressRow,
} from "./collection-types";

/**
 * get_collection_progress RPC を呼び、ログインユーザーのコレクション進捗を返す。
 *
 * RPC は user_id を引数で受け取らず auth.uid() を使うため、必ず「認証済み」
 * サーバークライアント(lib/supabase/server.ts の createClient())を渡すこと。
 * service role クライアントを渡すと auth.uid() が null になり空配列になる。
 */
export async function getCollectionProgress(
  supabase: SupabaseClient,
): Promise<CollectionProgress[]> {
  const { data, error } = await supabase.rpc("get_collection_progress");
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as CollectionProgressRow[];
  return attachCharacterImages(rows.map(mapProgressRow));
}

/**
 * 指定ユーザーの進捗を service_role 専用 RPC で取得する。
 * `includeAdminOnly=true` で admin_only シリーズも含める(admin プレビュー用)。
 * 呼び出し側(server route)で admin 判定し、userId はセッションから解決すること。
 */
export async function getCollectionProgressForUser(
  userId: string,
  includeAdminOnly: boolean,
): Promise<CollectionProgress[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_collection_progress_for_user", {
    p_user_id: userId,
    p_include_admin_only: includeAdminOnly,
  });
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as CollectionProgressRow[];
  const withCharacter = await attachCharacterImages(rows.map(mapProgressRow));
  const withCollected = await attachCollectedImages(withCharacter, userId);
  const withCompletion = await attachCompletionIds(withCollected, userId);
  // 解放ゲート: 前提カテゴリ未完走のゲート付きカテゴリ(例: ぷち神)はここで除外する。
  return filterLockedCategories(withCompletion, supabase);
}

/**
 * 解放ゲート(unlock_prerequisite_key)をマイページの進捗一覧にも適用する。
 *
 * `/style`・ホーム(applyCollectionUnlockGating)と同じポリシーで、
 * `unlock_prerequisite_key` が設定されたカテゴリは「前提カテゴリを完走(= 台紙 mount を
 * 作成し is_completed=true)」したときだけ表示する。前提未完走なら一覧から除外する。
 * admin プレビュー(admin_only の取り込み)とは独立の判定であり、admin も前提完走が必要。
 *
 * 前提カテゴリの完走状態は、同じ進捗配列内の該当行(神コレ等。public/series なので必ず含まれる)
 * の isCompleted から判定する。ゲート情報の取得に失敗したときは回帰を避けるため全件返す。
 */
async function filterLockedCategories(
  items: CollectionProgress[],
  supabase: SupabaseClient,
): Promise<CollectionProgress[]> {
  if (items.length === 0) return items;
  const { data, error } = await supabase
    .from("preset_categories")
    .select("key, unlock_prerequisite_key")
    .in(
      "key",
      items.map((i) => i.categoryKey),
    );
  if (error) {
    // ゲート判定不能。over-hiding を避け、従来挙動(全件)にフォールバックする。
    console.error("[collection-progress] unlock gate query failed:", error);
    return items;
  }
  const prerequisiteByKey = new Map<string, string | null>();
  for (const row of data ?? []) {
    prerequisiteByKey.set(
      row.key as string,
      (row.unlock_prerequisite_key as string | null) ?? null,
    );
  }
  // 完走(台紙作成 = is_completed)済みカテゴリの key 集合。
  const completedKeys = new Set(
    items.filter((i) => i.isCompleted).map((i) => i.categoryKey),
  );
  return items.filter((item) => {
    const prerequisite = prerequisiteByKey.get(item.categoryKey) ?? null;
    if (!prerequisite) return true; // ゲートなし → 常に表示
    return completedKeys.has(prerequisite); // 前提が完走済みのときだけ表示
  });
}

function mapProgressRow(row: CollectionProgressRow): CollectionProgress {
  return {
    categoryId: row.category_id,
    categoryKey: row.category_key,
    displayNameJa: row.display_name_ja,
    displayNameEn: row.display_name_en,
    completionThreshold: row.completion_threshold,
    uniqueOutfitCount: row.unique_outfit_count,
    isCompleted: row.is_completed,
    mountStatus: row.mount_status,
    mountImagePath: row.mount_image_path,
    completedAt: row.completed_at,
    completionViewMode: "mount",
    characterImageUrl: null,
    collectedImageUrls: [],
    completionId: null,
    mountTemplateWidth: null,
    mountTemplateHeight: null,
    progressModalFrameUrl: null,
    progressModalFrameWidth: null,
    progressModalFrameHeight: null,
    progressModalSlots: null,
    progressModalButton: null,
    progressModalCenter: null,
    progressModalRingColor: null,
    progressModalBadgeColor: null,
    progressModalBadgeTextColor: null,
    progressModalBadgeBgColor: null,
    progressModalButtonColor: null,
    progressModalButtonTextColor: null,
  };
}

/**
 * 完了済み(mount完成)シリーズに collection_completions.id を付与する。
 * フィード側の完了モーダルでシェア導線(台紙シェア/シェアページ)を出すのに使う。
 * mount_image_path 一致で現在アクティブな台紙の completion 行を引き当てる。
 */
async function attachCompletionIds(
  items: CollectionProgress[],
  userId: string,
): Promise<CollectionProgress[]> {
  const targets = items.filter((i) => i.isCompleted && i.mountImagePath);
  if (targets.length === 0) return items;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("collection_completions")
    .select("id, category_key, mount_image_path")
    .eq("user_id", userId)
    .eq("mount_status", "completed");
  if (error) {
    // completion_id の付与失敗は致命ではない(シェア導線が出ないだけ)
    return items;
  }
  const idByKeyPath = new Map<string, string>();
  for (const row of data ?? []) {
    const key = `${row.category_key as string}:::${row.mount_image_path as string}`;
    idByKeyPath.set(key, row.id as string);
  }
  return items.map((i) =>
    i.isCompleted && i.mountImagePath
      ? {
          ...i,
          completionId:
            idByKeyPath.get(`${i.categoryKey}:::${i.mountImagePath}`) ?? null,
        }
      : i,
  );
}

/**
 * 各シリーズに「集めたシール画像(衣装ごと最新1枚)」の公開URL配列を付与する。
 * モーダルのシール一覧(GET! / ?)で使う。最大 completionThreshold 件。
 */
async function attachCollectedImages(
  items: CollectionProgress[],
  userId: string,
): Promise<CollectionProgress[]> {
  if (items.length === 0) return items;
  return Promise.all(
    items.map(async (item) => {
      try {
        const reps = await getRepresentativeImagesForCategory({
          userId,
          categoryId: item.categoryId,
          limit: item.completionThreshold,
        });
        return { ...item, collectedImageUrls: reps.map((r) => r.imageUrl) };
      } catch {
        // 画像取得失敗は致命ではない(空配列にフォールバック)
        return item;
      }
    }),
  );
}

/**
 * 各シリーズに「リング中央キャラ画像」の公開URLを付与する。
 * RPC は返さないため、対象カテゴリの collection_character_path をまとめて引いて結合する。
 */
async function attachCharacterImages(
  items: CollectionProgress[],
): Promise<CollectionProgress[]> {
  if (items.length === 0) return items;
  const supabase = createAdminClient();
  const categoryIds = items.map((i) => i.categoryId);
  const { data, error } = await supabase
    .from("preset_categories")
    .select(
      "id, completion_view_mode, collection_character_path, mount_template_width, mount_template_height, progress_modal_frame_path, progress_modal_frame_width, progress_modal_frame_height, progress_modal_slots, progress_modal_button, progress_modal_center, progress_modal_ring_color, progress_modal_badge_color, progress_modal_badge_text_color, progress_modal_badge_bg_color, progress_modal_button_color, progress_modal_button_text_color",
    )
    .in("id", categoryIds);
  if (error) {
    // キャラ画像の付与失敗は致命ではない(リングはテキスト表示にフォールバック)
    return items;
  }
  const pathById = new Map<string, string | null>();
  const viewModeById = new Map<string, "mount" | "book">();
  const dimsById = new Map<
    string,
    { width: number | null; height: number | null }
  >();
  const modalById = new Map<
    string,
    {
      frameUrl: string | null;
      frameWidth: number | null;
      frameHeight: number | null;
      slots: NormalizedSlotRect[] | null;
      button: NormalizedSlotRect | null;
      center: NormalizedSlotRect | null;
      ringColor: string | null;
      badgeColor: string | null;
      badgeTextColor: string | null;
      badgeBgColor: string | null;
      buttonColor: string | null;
      buttonTextColor: string | null;
    }
  >();
  for (const row of data ?? []) {
    pathById.set(
      row.id as string,
      (row.collection_character_path as string | null) ?? null,
    );
    viewModeById.set(
      row.id as string,
      (row.completion_view_mode as string | null) === "book" ? "book" : "mount",
    );
    dimsById.set(row.id as string, {
      width: (row.mount_template_width as number | null) ?? null,
      height: (row.mount_template_height as number | null) ?? null,
    });
    const fw = row.progress_modal_frame_width as number | null;
    const fh = row.progress_modal_frame_height as number | null;
    modalById.set(row.id as string, {
      frameUrl: buildPublicGeneratedImageUrl(
        (row.progress_modal_frame_path as string | null) ?? null,
      ),
      frameWidth: typeof fw === "number" ? fw : null,
      frameHeight: typeof fh === "number" ? fh : null,
      slots: parseNormalizedSlots(row.progress_modal_slots),
      button: parseNormalizedRect(row.progress_modal_button),
      center: parseNormalizedRect(row.progress_modal_center),
      ringColor: (row.progress_modal_ring_color as string | null) ?? null,
      badgeColor: (row.progress_modal_badge_color as string | null) ?? null,
      badgeTextColor:
        (row.progress_modal_badge_text_color as string | null) ?? null,
      badgeBgColor:
        (row.progress_modal_badge_bg_color as string | null) ?? null,
      buttonColor: (row.progress_modal_button_color as string | null) ?? null,
      buttonTextColor:
        (row.progress_modal_button_text_color as string | null) ?? null,
    });
  }
  return items.map((i) => {
    const modal = modalById.get(i.categoryId);
    return {
      ...i,
      completionViewMode: viewModeById.get(i.categoryId) ?? "mount",
      characterImageUrl: buildPublicGeneratedImageUrl(
        pathById.get(i.categoryId) ?? null,
      ),
      mountTemplateWidth: dimsById.get(i.categoryId)?.width ?? null,
      mountTemplateHeight: dimsById.get(i.categoryId)?.height ?? null,
      progressModalFrameUrl: modal?.frameUrl ?? null,
      progressModalFrameWidth: modal?.frameWidth ?? null,
      progressModalFrameHeight: modal?.frameHeight ?? null,
      progressModalSlots: modal?.slots ?? null,
      progressModalButton: modal?.button ?? null,
      progressModalCenter: modal?.center ?? null,
      progressModalRingColor: modal?.ringColor ?? null,
      progressModalBadgeColor: modal?.badgeColor ?? null,
      progressModalBadgeTextColor: modal?.badgeTextColor ?? null,
      progressModalBadgeBgColor: modal?.badgeBgColor ?? null,
      progressModalButtonColor: modal?.buttonColor ?? null,
      progressModalButtonTextColor: modal?.buttonTextColor ?? null,
    };
  });
}
