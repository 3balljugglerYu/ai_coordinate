import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeStyleOutputAspectRatioMode } from "@/shared/generation/style-output-aspect-ratio";
import {
  buildStylePresetSlug,
  normalizeStylePresetOptionalPrompt,
  normalizeStylePresetPrompt,
  normalizeStylePresetTitle,
  type DualReferenceSource,
  type ImageInputMode,
  type StylePresetAdmin,
  type StylePresetCategoryRef,
  type StylePresetCategoryVisibility,
  type StylePresetGenerationRecord,
  type StylePresetInsert,
  type StylePresetPublicSummary,
  type StylePresetUpdate,
} from "./schema";

type SupabaseClient = ReturnType<typeof createAdminClient>;

interface PublishedStylePresetAccessOptions {
  includeAdminOnly?: boolean;
}

interface ProviderProfileRow {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
}

interface StylePresetCategoryRow {
  id: string;
  key: string;
  display_name_ja: string;
  display_name_en: string;
  badge_color: string;
  badge_text_color: string;
  skip_base_prefix: boolean;
  provider_user_id?: string | null;
  // PostgREST embedded select で profiles を JOIN した結果(provider クレジット用)
  provider?: ProviderProfileRow | ProviderProfileRow[] | null;
  output_aspect_ratio_mode?: string | null;
  user_guidance_ja?: string | null;
  user_guidance_en?: string | null;
  show_source_image_type_control?: boolean | null;
  show_background_change_control?: boolean | null;
  show_generation_model_control?: boolean | null;
  show_user_prompt_input?: boolean | null;
  user_prompt_label?: string | null;
  user_prompt_placeholder?: string | null;
  user_prompt_max_length?: number | null;
  visibility?: StylePresetCategoryVisibility | string | null;
  is_active: boolean;
  unlock_prerequisite_key?: string | null;
  progressive_batch_size?: number | null;
  unlock_announcement_hero_path?: string | null;
  unlock_announcement_initial_body?: string | null;
  unlock_announcement_drip_body?: string | null;
  unlock_announcement_accent_color?: string | null;
  unlock_announcement_accent_hover_color?: string | null;
  unlock_announcement_title_color?: string | null;
  unlock_announcement_soft_color?: string | null;
}

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
  category_id: string;
  image_input_mode: ImageInputMode;
  dual_reference_source?: DualReferenceSource | string | null;
  reference_image_url: string | null;
  reference_image_storage_path: string | null;
  reference_image_width: number | null;
  reference_image_height: number | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // PostgREST embedded select で category を JOIN した結果
  category?: StylePresetCategoryRow | StylePresetCategoryRow[] | null;
}

const STYLE_PRESET_WITH_CATEGORY_SELECT =
  "*, category:preset_categories!style_presets_category_id_fkey(id, key, display_name_ja, display_name_en, badge_color, badge_text_color, skip_base_prefix, output_aspect_ratio_mode, user_guidance_ja, user_guidance_en, show_source_image_type_control, show_background_change_control, show_generation_model_control, show_user_prompt_input, user_prompt_label, user_prompt_placeholder, user_prompt_max_length, visibility, is_active, provider_user_id, provider:profiles!preset_categories_provider_user_id_fkey(id, nickname, avatar_url), unlock_prerequisite_key, progressive_batch_size, unlock_announcement_hero_path, unlock_announcement_initial_body, unlock_announcement_drip_body, unlock_announcement_accent_color, unlock_announcement_accent_hover_color, unlock_announcement_title_color, unlock_announcement_soft_color)";

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

function normalizeCategoryVisibility(
  value: StylePresetCategoryVisibility | string | null | undefined,
): StylePresetCategoryVisibility {
  return value === "admin_only" ? "admin_only" : "public";
}

function canAccessCategory(
  category: StylePresetCategoryRef,
  options: PublishedStylePresetAccessOptions = {},
): boolean {
  return options.includeAdminOnly === true || category.visibility === "public";
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

function extractCategory(
  embedded: StylePresetRow["category"],
): StylePresetCategoryRow | null {
  if (!embedded) return null;
  if (Array.isArray(embedded)) return embedded[0] ?? null;
  return embedded;
}

function extractProvider(
  embedded: StylePresetCategoryRow["provider"],
): ProviderProfileRow | null {
  if (!embedded) return null;
  if (Array.isArray(embedded)) return embedded[0] ?? null;
  return embedded;
}

function mapCategoryRefStrict(
  row: StylePresetRow,
  embedded: StylePresetCategoryRow | null,
): StylePresetCategoryRef {
  if (!embedded) {
    // category_id は NOT NULL なので、本来は到達しない。
    // RPC 経由で取得した行 (embedded なし) もここに来るので、最小情報で fallback。
    return {
      id: row.category_id,
      key: "coordinate",
      displayNameJa: "コーディネート",
      displayNameEn: "Coordinate",
      badgeColor: "#1f2937",
      badgeTextColor: "#ffffff",
      skipBasePrefix: false,
      outputAspectRatioMode: "source",
      userGuidanceJa: null,
      userGuidanceEn: null,
      showSourceImageTypeControl: true,
      showBackgroundChangeControl: true,
      showGenerationModelControl: true,
      showUserPromptInput: false,
      userPromptLabel: null,
      userPromptPlaceholder: null,
      userPromptMaxLength: null,
      visibility: "public",
      isActive: true,
      providerUserId: null,
      providerNickname: null,
      providerAvatarUrl: null,
      unlockPrerequisiteKey: null,
      progressiveBatchSize: null,
      unlockAnnouncementHeroPath: null,
      unlockAnnouncementInitialBody: null,
      unlockAnnouncementDripBody: null,
      unlockAnnouncementAccentColor: null,
      unlockAnnouncementAccentHoverColor: null,
      unlockAnnouncementTitleColor: null,
      unlockAnnouncementSoftColor: null,
    };
  }
  const provider = extractProvider(embedded.provider);
  return {
    id: embedded.id,
    key: embedded.key,
    displayNameJa: embedded.display_name_ja,
    displayNameEn: embedded.display_name_en,
    badgeColor: embedded.badge_color,
    badgeTextColor: embedded.badge_text_color,
    skipBasePrefix: embedded.skip_base_prefix,
    outputAspectRatioMode: normalizeStyleOutputAspectRatioMode(
      embedded.output_aspect_ratio_mode,
    ),
    userGuidanceJa: embedded.user_guidance_ja ?? null,
    userGuidanceEn: embedded.user_guidance_en ?? null,
    showSourceImageTypeControl: embedded.show_source_image_type_control ?? true,
    showBackgroundChangeControl: embedded.show_background_change_control ?? true,
    showGenerationModelControl: embedded.show_generation_model_control ?? true,
    showUserPromptInput: embedded.show_user_prompt_input ?? false,
    userPromptLabel: embedded.user_prompt_label ?? null,
    userPromptPlaceholder: embedded.user_prompt_placeholder ?? null,
    userPromptMaxLength: embedded.user_prompt_max_length ?? null,
    visibility: normalizeCategoryVisibility(embedded.visibility),
    isActive: embedded.is_active,
    providerUserId: embedded.provider_user_id ?? null,
    providerNickname: provider?.nickname ?? null,
    providerAvatarUrl: provider?.avatar_url ?? null,
    unlockPrerequisiteKey: embedded.unlock_prerequisite_key ?? null,
    progressiveBatchSize: embedded.progressive_batch_size ?? null,
    unlockAnnouncementHeroPath: embedded.unlock_announcement_hero_path ?? null,
    unlockAnnouncementInitialBody:
      embedded.unlock_announcement_initial_body ?? null,
    unlockAnnouncementDripBody: embedded.unlock_announcement_drip_body ?? null,
    unlockAnnouncementAccentColor:
      embedded.unlock_announcement_accent_color ?? null,
    unlockAnnouncementAccentHoverColor:
      embedded.unlock_announcement_accent_hover_color ?? null,
    unlockAnnouncementTitleColor:
      embedded.unlock_announcement_title_color ?? null,
    unlockAnnouncementSoftColor:
      embedded.unlock_announcement_soft_color ?? null,
  };
}

function normalizeDualReferenceSource(
  value: DualReferenceSource | string | null | undefined,
): DualReferenceSource {
  return value === "user_upload" ? "user_upload" : "admin";
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
    category: mapCategoryRefStrict(row, extractCategory(row.category)),
    imageInputMode: row.image_input_mode,
    dualReferenceSource: normalizeDualReferenceSource(row.dual_reference_source),
    referenceImageUrl: row.reference_image_url,
    referenceImageStoragePath: row.reference_image_storage_path,
    referenceImageWidth: row.reference_image_width,
    referenceImageHeight: row.reference_image_height,
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
    category: mapCategoryRefStrict(row, extractCategory(row.category)),
    imageInputMode: row.image_input_mode,
    dualReferenceSource: normalizeDualReferenceSource(row.dual_reference_source),
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
    referenceImageUrl: row.reference_image_url,
    referenceImageStoragePath: row.reference_image_storage_path,
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
    .select(STYLE_PRESET_WITH_CATEGORY_SELECT)
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
    .select(STYLE_PRESET_WITH_CATEGORY_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[style-preset-repository] get admin by id error:", error);
    throw new Error("スタイルの取得に失敗しました");
  }

  return data ? mapRowToAdmin(data as StylePresetRow) : null;
}

export async function listPublishedStylePresets(
  options: PublishedStylePresetAccessOptions = {},
  client?: SupabaseClient
): Promise<StylePresetPublicSummary[]> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("style_presets")
    .select(STYLE_PRESET_WITH_CATEGORY_SELECT)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[style-preset-repository] list published error:", error);
    return [];
  }

  return (data ?? [])
    .map((row) => mapRowToPublicSummary(row as StylePresetRow))
    .filter((preset) => canAccessCategory(preset.category, options));
}

export async function getPublishedStylePresetById(
  id: string,
  options: PublishedStylePresetAccessOptions = {},
  client?: SupabaseClient
): Promise<StylePresetPublicSummary | null> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("style_presets")
    .select(STYLE_PRESET_WITH_CATEGORY_SELECT)
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("[style-preset-repository] get published by id error:", error);
    return null;
  }

  if (!data) return null;
  const preset = mapRowToPublicSummary(data as StylePresetRow);
  return canAccessCategory(preset.category, options) ? preset : null;
}

export async function getPublishedStylePresetForGeneration(
  id: string,
  options: PublishedStylePresetAccessOptions = {},
  client?: SupabaseClient
): Promise<StylePresetGenerationRecord | null> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("style_presets")
    .select(STYLE_PRESET_WITH_CATEGORY_SELECT)
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

  if (!data) return null;
  const preset = mapRowToGenerationRecord(data as StylePresetRow);
  return canAccessCategory(preset.category, options) ? preset : null;
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
    // 未指定なら RPC 側で 'coordinate' (default category) にフォールバック
    p_category_id: input.categoryId ?? null,
    p_image_input_mode: input.imageInputMode ?? "single",
    p_reference_image_url: input.referenceImageUrl ?? null,
    p_reference_image_storage_path: input.referenceImageStoragePath ?? null,
    p_reference_image_width: input.referenceImageWidth ?? null,
    p_reference_image_height: input.referenceImageHeight ?? null,
    p_dual_reference_source: input.dualReferenceSource ?? "admin",
  });

  const row = mapRpcRow(data);
  if (error || !row) {
    console.error("[style-preset-repository] create rpc error:", error);
    throw new Error(error?.message ?? "スタイルの作成に失敗しました");
  }

  // RPC は category を embedded で返さないので、JOIN 済みの行を再取得する
  const persisted = await getStylePresetForAdminById(row.id, supabase);
  return persisted ?? mapRowToAdmin(row);
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
    p_category_id:
      input.categoryId !== undefined ? input.categoryId : existing.category.id,
    p_image_input_mode:
      input.imageInputMode !== undefined
        ? input.imageInputMode
        : existing.imageInputMode,
    p_reference_image_url:
      input.referenceImageUrl !== undefined
        ? input.referenceImageUrl
        : existing.referenceImageUrl,
    p_reference_image_storage_path:
      input.referenceImageStoragePath !== undefined
        ? input.referenceImageStoragePath
        : existing.referenceImageStoragePath,
    p_reference_image_width:
      input.referenceImageWidth !== undefined
        ? input.referenceImageWidth
        : existing.referenceImageWidth,
    p_reference_image_height:
      input.referenceImageHeight !== undefined
        ? input.referenceImageHeight
        : existing.referenceImageHeight,
    p_dual_reference_source:
      input.dualReferenceSource !== undefined
        ? input.dualReferenceSource
        : existing.dualReferenceSource,
  });

  const row = mapRpcRow(data);
  if (error || !row) {
    console.error("[style-preset-repository] update rpc error:", error);
    throw new Error(error?.message ?? "スタイルの更新に失敗しました");
  }

  const persisted = await getStylePresetForAdminById(row.id, supabase);
  return persisted ?? mapRowToAdmin(row);
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
