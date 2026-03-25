import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildStylePresetSlug,
  normalizeStylePresetOptionalPrompt,
  normalizeStylePresetPrompt,
  normalizeStylePresetTitle,
  type StylePresetAdmin,
  type StylePresetGenerationRecord,
  type StylePresetInsert,
  type StylePresetPublicSummary,
  type StylePresetUpdate,
} from "./schema";

type SupabaseClient = ReturnType<typeof createAdminClient>;

interface StylePresetRow {
  id: string;
  slug: string;
  title: string;
  styling_prompt: string;
  background_prompt: string | null;
  thumbnail_image_url: string;
  thumbnail_storage_path: string | null;
  thumbnail_width: number;
  thumbnail_height: number;
  sort_order: number;
  status: "draft" | "published";
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

function mapRpcRow(data: unknown): StylePresetRow | null {
  if (!data) {
    return null;
  }

  if (Array.isArray(data)) {
    return (data[0] as StylePresetRow | undefined) ?? null;
  }

  return data as StylePresetRow;
}

function mapRowToAdmin(row: StylePresetRow): StylePresetAdmin {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    stylingPrompt: row.styling_prompt,
    backgroundPrompt: row.background_prompt,
    thumbnailImageUrl: row.thumbnail_image_url,
    thumbnailStoragePath: row.thumbnail_storage_path,
    thumbnailWidth: row.thumbnail_width,
    thumbnailHeight: row.thumbnail_height,
    sortOrder: row.sort_order,
    status: row.status,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToPublicSummary(row: StylePresetRow): StylePresetPublicSummary {
  return {
    id: row.id,
    title: row.title,
    thumbnailImageUrl: row.thumbnail_image_url,
    thumbnailWidth: row.thumbnail_width,
    thumbnailHeight: row.thumbnail_height,
    hasBackgroundPrompt: Boolean(row.background_prompt?.trim()),
  };
}

function mapRowToGenerationRecord(
  row: StylePresetRow
): StylePresetGenerationRecord {
  return {
    ...mapRowToPublicSummary(row),
    stylingPrompt: row.styling_prompt,
    backgroundPrompt: row.background_prompt,
    status: row.status,
  };
}

async function generateUniqueSlug(
  title: string,
  supabase: SupabaseClient
): Promise<string> {
  const baseSlug = buildStylePresetSlug(title);
  const { data, error } = await supabase
    .from("style_presets")
    .select("slug")
    .like("slug", `${baseSlug}%`);

  if (error) {
    console.error("[style-preset-repository] slug lookup error:", error);
    throw new Error("slug の生成に失敗しました");
  }

  const existing = new Set((data ?? []).map((row) => String(row.slug)));
  if (!existing.has(baseSlug)) {
    return baseSlug;
  }

  let sequence = 2;
  while (existing.has(`${baseSlug}-${sequence}`)) {
    sequence += 1;
  }

  return `${baseSlug}-${sequence}`;
}

export async function listStylePresetsForAdmin(
  client?: SupabaseClient
): Promise<StylePresetAdmin[]> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("style_presets")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[style-preset-repository] list admin error:", error);
    throw new Error("スタイル一覧の取得に失敗しました");
  }

  return (data ?? []).map((row) => mapRowToAdmin(row as StylePresetRow));
}

export async function getStylePresetForAdminById(
  id: string,
  client?: SupabaseClient
): Promise<StylePresetAdmin | null> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("style_presets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[style-preset-repository] get admin by id error:", error);
    throw new Error("スタイルの取得に失敗しました");
  }

  return data ? mapRowToAdmin(data as StylePresetRow) : null;
}

export async function listPublishedStylePresets(
  client?: SupabaseClient
): Promise<StylePresetPublicSummary[]> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("style_presets")
    .select("*")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[style-preset-repository] list published error:", error);
    return [];
  }

  return (data ?? []).map((row) => mapRowToPublicSummary(row as StylePresetRow));
}

export async function getPublishedStylePresetById(
  id: string,
  client?: SupabaseClient
): Promise<StylePresetPublicSummary | null> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("style_presets")
    .select("*")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("[style-preset-repository] get published by id error:", error);
    return null;
  }

  return data ? mapRowToPublicSummary(data as StylePresetRow) : null;
}

export async function getPublishedStylePresetForGeneration(
  id: string,
  client?: SupabaseClient
): Promise<StylePresetGenerationRecord | null> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("style_presets")
    .select("*")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error(
      "[style-preset-repository] get published for generation error:",
      error
    );
    return null;
  }

  return data ? mapRowToGenerationRecord(data as StylePresetRow) : null;
}

export async function createStylePreset(
  input: StylePresetInsert,
  client?: SupabaseClient
): Promise<StylePresetAdmin> {
  const supabase = getSupabase(client);
  const title = normalizeStylePresetTitle(input.title);
  const stylingPrompt = normalizeStylePresetPrompt(input.stylingPrompt);
  const backgroundPrompt = normalizeStylePresetOptionalPrompt(
    input.backgroundPrompt
  );
  const slug = await generateUniqueSlug(title, supabase);
  const presetId = input.id ?? crypto.randomUUID();

  const { data, error } = await supabase.rpc("create_style_preset", {
    p_id: presetId,
    p_slug: slug,
    p_title: title,
    p_styling_prompt: stylingPrompt,
    p_background_prompt: backgroundPrompt,
    p_thumbnail_image_url: input.thumbnailImageUrl,
    p_thumbnail_storage_path: input.thumbnailStoragePath ?? null,
    p_thumbnail_width: input.thumbnailWidth,
    p_thumbnail_height: input.thumbnailHeight,
    p_sort_order: input.sortOrder ?? 0,
    p_status: input.status,
    p_created_by: input.createdBy ?? null,
  });

  const row = mapRpcRow(data);
  if (error || !row) {
    console.error("[style-preset-repository] create rpc error:", error);
    throw new Error("スタイルの作成に失敗しました");
  }

  return mapRowToAdmin(row);
}

export async function updateStylePreset(
  id: string,
  input: StylePresetUpdate,
  client?: SupabaseClient
): Promise<StylePresetAdmin> {
  const supabase = getSupabase(client);
  const existing = await getStylePresetForAdminById(id, supabase);
  if (!existing) {
    throw new Error("スタイルの取得に失敗しました");
  }

  const { data, error } = await supabase.rpc("update_style_preset", {
    p_id: id,
    p_title:
      input.title !== undefined
        ? normalizeStylePresetTitle(input.title)
        : existing.title,
    p_styling_prompt:
      input.stylingPrompt !== undefined
        ? normalizeStylePresetPrompt(input.stylingPrompt)
        : existing.stylingPrompt,
    p_background_prompt:
      input.backgroundPrompt !== undefined
        ? normalizeStylePresetOptionalPrompt(input.backgroundPrompt)
        : existing.backgroundPrompt,
    p_thumbnail_image_url:
      input.thumbnailImageUrl !== undefined
        ? input.thumbnailImageUrl
        : existing.thumbnailImageUrl,
    p_thumbnail_storage_path:
      input.thumbnailStoragePath !== undefined
        ? input.thumbnailStoragePath
        : existing.thumbnailStoragePath,
    p_thumbnail_width:
      input.thumbnailWidth !== undefined
        ? input.thumbnailWidth
        : existing.thumbnailWidth,
    p_thumbnail_height:
      input.thumbnailHeight !== undefined
        ? input.thumbnailHeight
        : existing.thumbnailHeight,
    p_sort_order:
      input.sortOrder !== undefined ? input.sortOrder : existing.sortOrder,
    p_status: input.status !== undefined ? input.status : existing.status,
    p_updated_by:
      input.updatedBy !== undefined ? input.updatedBy : existing.updatedBy,
  });

  const row = mapRpcRow(data);
  if (error || !row) {
    console.error("[style-preset-repository] update rpc error:", error);
    throw new Error("スタイルの更新に失敗しました");
  }

  return mapRowToAdmin(row);
}

export async function deleteStylePreset(
  id: string,
  client?: SupabaseClient
): Promise<void> {
  const supabase = getSupabase(client);
  const { error } = await supabase.rpc("delete_style_preset_and_reorder", {
    p_id: id,
  });

  if (error) {
    console.error("[style-preset-repository] delete rpc error:", error);
    throw new Error("スタイルの削除に失敗しました");
  }
}

export async function reorderStylePresets(
  order: string[],
  updatedBy: string | null,
  client?: SupabaseClient
): Promise<void> {
  const supabase = getSupabase(client);
  const { error } = await supabase.rpc("reorder_style_presets", {
    p_order: order,
    p_updated_by: updatedBy,
  });

  if (error) {
    console.error("[style-preset-repository] reorder rpc error:", error);
    throw new Error("表示順の更新に失敗しました");
  }
}
