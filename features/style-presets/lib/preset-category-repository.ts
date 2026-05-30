import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseClient = ReturnType<typeof createAdminClient>;

export const PRESET_CATEGORY_IMAGE_INPUT_MODES = ["single", "dual"] as const;
export type PresetCategoryImageInputMode =
  (typeof PRESET_CATEGORY_IMAGE_INPUT_MODES)[number];

export interface PresetCategoryRow {
  id: string;
  key: string;
  display_name_ja: string;
  display_name_en: string;
  badge_color: string;
  badge_text_color: string;
  skip_base_prefix: boolean;
  default_image_input_mode: PresetCategoryImageInputMode;
  display_order: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PresetCategoryAdmin {
  id: string;
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  badgeColor: string;
  badgeTextColor: string;
  skipBasePrefix: boolean;
  defaultImageInputMode: PresetCategoryImageInputMode;
  displayOrder: number;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PresetCategoryInsert {
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  badgeColor?: string;
  badgeTextColor?: string;
  skipBasePrefix?: boolean;
  defaultImageInputMode?: PresetCategoryImageInputMode;
  displayOrder?: number;
  isActive?: boolean;
  createdBy?: string | null;
}

export interface PresetCategoryUpdate {
  displayNameJa?: string;
  displayNameEn?: string;
  badgeColor?: string;
  badgeTextColor?: string;
  skipBasePrefix?: boolean;
  defaultImageInputMode?: PresetCategoryImageInputMode;
  displayOrder?: number;
  isActive?: boolean;
  updatedBy?: string | null;
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

function mapRow(row: PresetCategoryRow): PresetCategoryAdmin {
  return {
    id: row.id,
    key: row.key,
    displayNameJa: row.display_name_ja,
    displayNameEn: row.display_name_en,
    badgeColor: row.badge_color,
    badgeTextColor: row.badge_text_color,
    skipBasePrefix: row.skip_base_prefix,
    defaultImageInputMode: row.default_image_input_mode,
    displayOrder: row.display_order,
    isActive: row.is_active,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 全カテゴリ一覧。デフォルトは active のみ (admin の新規 preset 作成選択肢用)。
 * includeInactive=true で過去 preset の表示用に inactive も含めて取得できる。
 */
export async function listPresetCategories(
  options: { includeInactive?: boolean } = {},
  client?: SupabaseClient,
): Promise<PresetCategoryAdmin[]> {
  const supabase = getSupabase(client);
  let query = supabase
    .from("preset_categories")
    .select("*")
    .order("display_order", { ascending: true })
    .order("key", { ascending: true });

  if (!options.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[preset-category-repository] list error:", error);
    throw new Error("カテゴリ一覧の取得に失敗しました");
  }
  return (data ?? []).map((row) => mapRow(row as PresetCategoryRow));
}

export async function getPresetCategoryById(
  id: string,
  client?: SupabaseClient,
): Promise<PresetCategoryAdmin | null> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("preset_categories")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[preset-category-repository] get by id error:", error);
    throw new Error("カテゴリの取得に失敗しました");
  }
  return data ? mapRow(data as PresetCategoryRow) : null;
}

export async function getPresetCategoryByKey(
  key: string,
  client?: SupabaseClient,
): Promise<PresetCategoryAdmin | null> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("preset_categories")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    console.error("[preset-category-repository] get by key error:", error);
    throw new Error("カテゴリの取得に失敗しました");
  }
  return data ? mapRow(data as PresetCategoryRow) : null;
}

export async function createPresetCategory(
  input: PresetCategoryInsert,
  client?: SupabaseClient,
): Promise<PresetCategoryAdmin> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("preset_categories")
    .insert({
      key: input.key,
      display_name_ja: input.displayNameJa,
      display_name_en: input.displayNameEn,
      badge_color: input.badgeColor ?? "#1f2937",
      badge_text_color: input.badgeTextColor ?? "#ffffff",
      skip_base_prefix: input.skipBasePrefix ?? false,
      default_image_input_mode: input.defaultImageInputMode ?? "single",
      display_order: input.displayOrder ?? 0,
      is_active: input.isActive ?? true,
      created_by: input.createdBy ?? null,
      updated_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[preset-category-repository] create error:", error);
    throw new Error(error?.message ?? "カテゴリの作成に失敗しました");
  }
  return mapRow(data as PresetCategoryRow);
}

export async function updatePresetCategory(
  id: string,
  input: PresetCategoryUpdate,
  client?: SupabaseClient,
): Promise<PresetCategoryAdmin> {
  const supabase = getSupabase(client);
  const payload: Record<string, unknown> = {};
  if (input.displayNameJa !== undefined) payload.display_name_ja = input.displayNameJa;
  if (input.displayNameEn !== undefined) payload.display_name_en = input.displayNameEn;
  if (input.badgeColor !== undefined) payload.badge_color = input.badgeColor;
  if (input.badgeTextColor !== undefined) payload.badge_text_color = input.badgeTextColor;
  if (input.skipBasePrefix !== undefined) payload.skip_base_prefix = input.skipBasePrefix;
  if (input.defaultImageInputMode !== undefined)
    payload.default_image_input_mode = input.defaultImageInputMode;
  if (input.displayOrder !== undefined) payload.display_order = input.displayOrder;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.updatedBy !== undefined) payload.updated_by = input.updatedBy;

  if (Object.keys(payload).length === 0) {
    const current = await getPresetCategoryById(id, supabase);
    if (!current) {
      throw new Error("カテゴリが見つかりません");
    }
    return current;
  }

  const { data, error } = await supabase
    .from("preset_categories")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[preset-category-repository] update error:", error);
    throw new Error(error?.message ?? "カテゴリの更新に失敗しました");
  }
  return mapRow(data as PresetCategoryRow);
}

/**
 * 物理削除はしない。is_active=false に倒すソフトデリート。
 * (REQ-7 の方針: 既存 preset の表示・生成可否は status で制御するため、
 *  inactive にしても過去 preset の集計と display を壊さない)
 */
export async function deactivatePresetCategory(
  id: string,
  updatedBy: string | null,
  client?: SupabaseClient,
): Promise<PresetCategoryAdmin> {
  return updatePresetCategory(
    id,
    { isActive: false, updatedBy: updatedBy ?? null },
    client,
  );
}
