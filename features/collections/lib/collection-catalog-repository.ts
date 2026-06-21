import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildPublicGeneratedImageUrl } from "./public-mount-server-api";

/**
 * コレクション図鑑(/collections)の公開カタログ1件。
 * ログイン不要で「どんなコレクションがあるか」を見せるためのメタ情報。
 * 進捗(集めた数など)は持たず、ログイン時に CollectionProgress を categoryKey でマージする。
 */
export interface CollectionCatalogItem {
  id: string;
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  completionThreshold: number;
  /** 図鑑カードの代表画像(リング中央キャラ)。無ければ台紙テンプレにフォールバック。 */
  characterImageUrl: string | null;
  mountTemplateUrl: string | null;
  displayOrder: number;
  /** 解放ゲート(設定時は前提カテゴリ完走まで図鑑に出さない)。 */
  unlockPrerequisiteKey: string | null;
  /** 開催期間(図鑑では「集めよう/終了・また登場/近日」の出し分けに使う)。null は制限なし。 */
  collectionDisplayStartsAt: string | null;
  collectionDisplayEndsAt: string | null;
}

/**
 * 公開コレクション系列のカタログを取得する(匿名OK)。
 * is_collection_series=true / is_active=true / visibility=public のみ。
 * 表示期間(collection_display_*)は進捗UI用なので図鑑カタログでは無視し、
 * 「どんなコレクションがあるか」を一覧で見せる。失敗時は空配列(致命にしない)。
 */
export async function getPublicCollectionSeriesCatalog(): Promise<
  CollectionCatalogItem[]
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("preset_categories")
    .select(
      "id, key, display_name_ja, display_name_en, completion_threshold, collection_character_path, mount_template_path, display_order, unlock_prerequisite_key, collection_display_starts_at, collection_display_ends_at",
    )
    .eq("is_collection_series", true)
    .eq("is_active", true)
    .eq("visibility", "public")
    .order("display_order", { ascending: true })
    .order("key", { ascending: true });

  if (error) {
    console.error("[collection-catalog-repository] list error:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    key: row.key as string,
    displayNameJa: row.display_name_ja as string,
    displayNameEn:
      (row.display_name_en as string | null) ?? (row.display_name_ja as string),
    completionThreshold: (row.completion_threshold as number | null) ?? 0,
    characterImageUrl: buildPublicGeneratedImageUrl(
      (row.collection_character_path as string | null) ?? null,
    ),
    mountTemplateUrl: buildPublicGeneratedImageUrl(
      (row.mount_template_path as string | null) ?? null,
    ),
    displayOrder: (row.display_order as number | null) ?? 0,
    unlockPrerequisiteKey:
      (row.unlock_prerequisite_key as string | null) ?? null,
    collectionDisplayStartsAt:
      (row.collection_display_starts_at as string | null) ?? null,
    collectionDisplayEndsAt:
      (row.collection_display_ends_at as string | null) ?? null,
  }));
}
