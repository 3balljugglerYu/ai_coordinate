import { createAdminClient } from "@/lib/supabase/admin";
import {
  STYLE_PRESET_CATEGORY_VISIBILITY_VALUES,
  type StylePresetCategoryVisibility,
} from "./schema";
import {
  STYLE_OUTPUT_ASPECT_RATIO_MODES,
  normalizeStyleOutputAspectRatioMode,
  type StyleOutputAspectRatioMode,
} from "@/shared/generation/style-output-aspect-ratio";
import {
  isMountLayoutKey,
  parseNormalizedRect,
  parseNormalizedSlots,
  type MountLayoutKey,
  type NormalizedSlotRect,
} from "@/features/collections/lib/mount-layouts";

type SupabaseClient = ReturnType<typeof createAdminClient>;

export const PRESET_CATEGORY_IMAGE_INPUT_MODES = ["single", "dual"] as const;
export type PresetCategoryImageInputMode =
  (typeof PRESET_CATEGORY_IMAGE_INPUT_MODES)[number];
export { STYLE_PRESET_CATEGORY_VISIBILITY_VALUES };
export { STYLE_OUTPUT_ASPECT_RATIO_MODES };
export type { StylePresetCategoryVisibility };
export type { StyleOutputAspectRatioMode };

export interface PresetCategoryRow {
  id: string;
  key: string;
  display_name_ja: string;
  display_name_en: string;
  badge_color: string;
  badge_text_color: string;
  skip_base_prefix: boolean;
  default_image_input_mode: PresetCategoryImageInputMode;
  output_aspect_ratio_mode?: StyleOutputAspectRatioMode | null;
  user_guidance_ja?: string | null;
  user_guidance_en?: string | null;
  show_source_image_type_control?: boolean | null;
  show_background_change_control?: boolean | null;
  show_generation_model_control?: boolean | null;
  show_user_prompt_input?: boolean | null;
  user_prompt_label?: string | null;
  user_prompt_placeholder?: string | null;
  user_prompt_max_length?: number | null;
  visibility?: StylePresetCategoryVisibility | null;
  is_collection_series?: boolean | null;
  completion_threshold?: number | null;
  completion_view_mode?: string | null;
  book_cover_path?: string | null;
  unlock_prerequisite_key?: string | null;
  progressive_batch_size?: number | null;
  unlock_announcement_hero_path?: string | null;
  unlock_announcement_initial_body?: string | null;
  unlock_announcement_drip_body?: string | null;
  unlock_announcement_accent_color?: string | null;
  unlock_announcement_accent_hover_color?: string | null;
  unlock_announcement_title_color?: string | null;
  unlock_announcement_soft_color?: string | null;
  mount_template_path?: string | null;
  mount_layout?: string | null;
  mount_slots?: unknown;
  mount_template_width?: number | null;
  mount_template_height?: number | null;
  collection_character_path?: string | null;
  collection_display_starts_at?: string | null;
  collection_display_ends_at?: string | null;
  progress_modal_frame_path?: string | null;
  progress_modal_frame_width?: number | null;
  progress_modal_frame_height?: number | null;
  progress_modal_slots?: unknown;
  progress_modal_button?: unknown;
  progress_modal_center?: unknown;
  progress_modal_ring_color?: string | null;
  progress_modal_badge_color?: string | null;
  progress_modal_badge_text_color?: string | null;
  progress_modal_badge_bg_color?: string | null;
  progress_modal_button_color?: string | null;
  progress_modal_button_text_color?: string | null;
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
  outputAspectRatioMode: StyleOutputAspectRatioMode;
  userGuidanceJa: string | null;
  userGuidanceEn: string | null;
  showSourceImageTypeControl: boolean;
  showBackgroundChangeControl: boolean;
  showGenerationModelControl: boolean;
  showUserPromptInput: boolean;
  userPromptLabel: string | null;
  userPromptPlaceholder: string | null;
  userPromptMaxLength: number | null;
  visibility: StylePresetCategoryVisibility;
  isCollectionSeries: boolean;
  completionThreshold: number | null;
  /** 完走表示モード: 'mount'(単一台紙) / 'book'(めくれる日記帳)。 */
  completionViewMode: "mount" | "book";
  /** book 表示の表紙(0ページ目)画像の storage path。 */
  bookCoverPath: string | null;
  unlockPrerequisiteKey: string | null;
  progressiveBatchSize: number | null;
  unlockAnnouncementHeroPath: string | null;
  unlockAnnouncementInitialBody: string | null;
  unlockAnnouncementDripBody: string | null;
  unlockAnnouncementAccentColor: string | null;
  unlockAnnouncementAccentHoverColor: string | null;
  unlockAnnouncementTitleColor: string | null;
  unlockAnnouncementSoftColor: string | null;
  mountTemplatePath: string | null;
  mountLayout: MountLayoutKey | null;
  mountSlots: NormalizedSlotRect[] | null;
  mountTemplateWidth: number | null;
  mountTemplateHeight: number | null;
  collectionCharacterPath: string | null;
  collectionDisplayStartsAt: string | null;
  collectionDisplayEndsAt: string | null;
  progressModalFramePath: string | null;
  progressModalFrameWidth: number | null;
  progressModalFrameHeight: number | null;
  progressModalSlots: NormalizedSlotRect[] | null;
  progressModalButton: NormalizedSlotRect | null;
  progressModalCenter: NormalizedSlotRect | null;
  progressModalRingColor: string | null;
  progressModalBadgeColor: string | null;
  progressModalBadgeTextColor: string | null;
  progressModalBadgeBgColor: string | null;
  progressModalButtonColor: string | null;
  progressModalButtonTextColor: string | null;
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
  outputAspectRatioMode?: StyleOutputAspectRatioMode;
  userGuidanceJa?: string | null;
  userGuidanceEn?: string | null;
  showSourceImageTypeControl?: boolean;
  showBackgroundChangeControl?: boolean;
  showGenerationModelControl?: boolean;
  showUserPromptInput?: boolean;
  userPromptLabel?: string | null;
  userPromptPlaceholder?: string | null;
  userPromptMaxLength?: number | null;
  visibility?: StylePresetCategoryVisibility;
  isCollectionSeries?: boolean;
  completionThreshold?: number | null;
  completionViewMode?: "mount" | "book";
  bookCoverPath?: string | null;
  unlockPrerequisiteKey?: string | null;
  progressiveBatchSize?: number | null;
  unlockAnnouncementHeroPath?: string | null;
  unlockAnnouncementInitialBody?: string | null;
  unlockAnnouncementDripBody?: string | null;
  unlockAnnouncementAccentColor?: string | null;
  unlockAnnouncementAccentHoverColor?: string | null;
  unlockAnnouncementTitleColor?: string | null;
  unlockAnnouncementSoftColor?: string | null;
  mountTemplatePath?: string | null;
  mountLayout?: MountLayoutKey | null;
  mountSlots?: NormalizedSlotRect[] | null;
  mountTemplateWidth?: number | null;
  mountTemplateHeight?: number | null;
  collectionCharacterPath?: string | null;
  collectionDisplayStartsAt?: string | null;
  collectionDisplayEndsAt?: string | null;
  progressModalFramePath?: string | null;
  progressModalFrameWidth?: number | null;
  progressModalFrameHeight?: number | null;
  progressModalSlots?: NormalizedSlotRect[] | null;
  progressModalButton?: NormalizedSlotRect | null;
  progressModalCenter?: NormalizedSlotRect | null;
  progressModalRingColor?: string | null;
  progressModalBadgeColor?: string | null;
  progressModalBadgeTextColor?: string | null;
  progressModalBadgeBgColor?: string | null;
  progressModalButtonColor?: string | null;
  progressModalButtonTextColor?: string | null;
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
  outputAspectRatioMode?: StyleOutputAspectRatioMode;
  userGuidanceJa?: string | null;
  userGuidanceEn?: string | null;
  showSourceImageTypeControl?: boolean;
  showBackgroundChangeControl?: boolean;
  showGenerationModelControl?: boolean;
  showUserPromptInput?: boolean;
  userPromptLabel?: string | null;
  userPromptPlaceholder?: string | null;
  userPromptMaxLength?: number | null;
  visibility?: StylePresetCategoryVisibility;
  isCollectionSeries?: boolean;
  completionThreshold?: number | null;
  completionViewMode?: "mount" | "book";
  bookCoverPath?: string | null;
  unlockPrerequisiteKey?: string | null;
  progressiveBatchSize?: number | null;
  unlockAnnouncementHeroPath?: string | null;
  unlockAnnouncementInitialBody?: string | null;
  unlockAnnouncementDripBody?: string | null;
  unlockAnnouncementAccentColor?: string | null;
  unlockAnnouncementAccentHoverColor?: string | null;
  unlockAnnouncementTitleColor?: string | null;
  unlockAnnouncementSoftColor?: string | null;
  mountTemplatePath?: string | null;
  mountLayout?: MountLayoutKey | null;
  mountSlots?: NormalizedSlotRect[] | null;
  mountTemplateWidth?: number | null;
  mountTemplateHeight?: number | null;
  collectionCharacterPath?: string | null;
  collectionDisplayStartsAt?: string | null;
  collectionDisplayEndsAt?: string | null;
  progressModalFramePath?: string | null;
  progressModalFrameWidth?: number | null;
  progressModalFrameHeight?: number | null;
  progressModalSlots?: NormalizedSlotRect[] | null;
  progressModalButton?: NormalizedSlotRect | null;
  progressModalCenter?: NormalizedSlotRect | null;
  progressModalRingColor?: string | null;
  progressModalBadgeColor?: string | null;
  progressModalBadgeTextColor?: string | null;
  progressModalBadgeBgColor?: string | null;
  progressModalButtonColor?: string | null;
  progressModalButtonTextColor?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  updatedBy?: string | null;
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

function normalizeVisibility(
  value: StylePresetCategoryVisibility | string | null | undefined,
): StylePresetCategoryVisibility {
  return value === "admin_only" ? "admin_only" : "public";
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
    outputAspectRatioMode: normalizeStyleOutputAspectRatioMode(
      row.output_aspect_ratio_mode,
    ),
    userGuidanceJa: row.user_guidance_ja ?? null,
    userGuidanceEn: row.user_guidance_en ?? null,
    showSourceImageTypeControl: row.show_source_image_type_control ?? true,
    showBackgroundChangeControl: row.show_background_change_control ?? true,
    showGenerationModelControl: row.show_generation_model_control ?? true,
    showUserPromptInput: row.show_user_prompt_input ?? false,
    userPromptLabel: row.user_prompt_label ?? null,
    userPromptPlaceholder: row.user_prompt_placeholder ?? null,
    userPromptMaxLength: row.user_prompt_max_length ?? null,
    visibility: normalizeVisibility(row.visibility),
    isCollectionSeries: row.is_collection_series ?? false,
    completionThreshold: row.completion_threshold ?? null,
    completionViewMode: row.completion_view_mode === "book" ? "book" : "mount",
    bookCoverPath: row.book_cover_path ?? null,
    unlockPrerequisiteKey: row.unlock_prerequisite_key ?? null,
    progressiveBatchSize: row.progressive_batch_size ?? null,
    unlockAnnouncementHeroPath: row.unlock_announcement_hero_path ?? null,
    unlockAnnouncementInitialBody: row.unlock_announcement_initial_body ?? null,
    unlockAnnouncementDripBody: row.unlock_announcement_drip_body ?? null,
    unlockAnnouncementAccentColor: row.unlock_announcement_accent_color ?? null,
    unlockAnnouncementAccentHoverColor:
      row.unlock_announcement_accent_hover_color ?? null,
    unlockAnnouncementTitleColor: row.unlock_announcement_title_color ?? null,
    unlockAnnouncementSoftColor: row.unlock_announcement_soft_color ?? null,
    mountTemplatePath: row.mount_template_path ?? null,
    mountLayout: isMountLayoutKey(row.mount_layout) ? row.mount_layout : null,
    mountSlots: parseNormalizedSlots(row.mount_slots),
    mountTemplateWidth:
      typeof row.mount_template_width === "number"
        ? row.mount_template_width
        : null,
    mountTemplateHeight:
      typeof row.mount_template_height === "number"
        ? row.mount_template_height
        : null,
    collectionCharacterPath: row.collection_character_path ?? null,
    collectionDisplayStartsAt: row.collection_display_starts_at ?? null,
    collectionDisplayEndsAt: row.collection_display_ends_at ?? null,
    progressModalFramePath: row.progress_modal_frame_path ?? null,
    progressModalFrameWidth:
      typeof row.progress_modal_frame_width === "number"
        ? row.progress_modal_frame_width
        : null,
    progressModalFrameHeight:
      typeof row.progress_modal_frame_height === "number"
        ? row.progress_modal_frame_height
        : null,
    progressModalSlots: parseNormalizedSlots(row.progress_modal_slots),
    progressModalButton: parseNormalizedRect(row.progress_modal_button),
    progressModalCenter: parseNormalizedRect(row.progress_modal_center),
    progressModalRingColor: row.progress_modal_ring_color ?? null,
    progressModalBadgeColor: row.progress_modal_badge_color ?? null,
    progressModalBadgeTextColor: row.progress_modal_badge_text_color ?? null,
    progressModalBadgeBgColor: row.progress_modal_badge_bg_color ?? null,
    progressModalButtonColor: row.progress_modal_button_color ?? null,
    progressModalButtonTextColor:
      row.progress_modal_button_text_color ?? null,
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
      output_aspect_ratio_mode: input.outputAspectRatioMode ?? "source",
      user_guidance_ja: input.userGuidanceJa ?? null,
      user_guidance_en: input.userGuidanceEn ?? null,
      show_source_image_type_control: input.showSourceImageTypeControl ?? true,
      show_background_change_control: input.showBackgroundChangeControl ?? true,
      show_generation_model_control: input.showGenerationModelControl ?? true,
      show_user_prompt_input: input.showUserPromptInput ?? false,
      user_prompt_label: input.userPromptLabel ?? null,
      user_prompt_placeholder: input.userPromptPlaceholder ?? null,
      user_prompt_max_length: input.userPromptMaxLength ?? null,
      visibility: input.visibility ?? "admin_only",
      is_collection_series: input.isCollectionSeries ?? false,
      completion_threshold: input.completionThreshold ?? null,
      completion_view_mode: input.completionViewMode ?? "mount",
      book_cover_path: input.bookCoverPath ?? null,
      unlock_prerequisite_key: input.unlockPrerequisiteKey ?? null,
      progressive_batch_size: input.progressiveBatchSize ?? null,
      unlock_announcement_hero_path: input.unlockAnnouncementHeroPath ?? null,
      unlock_announcement_initial_body:
        input.unlockAnnouncementInitialBody ?? null,
      unlock_announcement_drip_body: input.unlockAnnouncementDripBody ?? null,
      unlock_announcement_accent_color:
        input.unlockAnnouncementAccentColor ?? null,
      unlock_announcement_accent_hover_color:
        input.unlockAnnouncementAccentHoverColor ?? null,
      unlock_announcement_title_color:
        input.unlockAnnouncementTitleColor ?? null,
      unlock_announcement_soft_color: input.unlockAnnouncementSoftColor ?? null,
      mount_template_path: input.mountTemplatePath ?? null,
      mount_layout: input.mountLayout ?? null,
      mount_slots: input.mountSlots ?? null,
      mount_template_width: input.mountTemplateWidth ?? null,
      mount_template_height: input.mountTemplateHeight ?? null,
      collection_character_path: input.collectionCharacterPath ?? null,
      collection_display_starts_at: input.collectionDisplayStartsAt ?? null,
      collection_display_ends_at: input.collectionDisplayEndsAt ?? null,
      progress_modal_frame_path: input.progressModalFramePath ?? null,
      progress_modal_frame_width: input.progressModalFrameWidth ?? null,
      progress_modal_frame_height: input.progressModalFrameHeight ?? null,
      progress_modal_slots: input.progressModalSlots ?? null,
      progress_modal_button: input.progressModalButton ?? null,
      progress_modal_center: input.progressModalCenter ?? null,
      progress_modal_ring_color: input.progressModalRingColor ?? null,
      progress_modal_badge_color: input.progressModalBadgeColor ?? null,
      progress_modal_badge_text_color: input.progressModalBadgeTextColor ?? null,
      progress_modal_badge_bg_color: input.progressModalBadgeBgColor ?? null,
      progress_modal_button_color: input.progressModalButtonColor ?? null,
      progress_modal_button_text_color:
        input.progressModalButtonTextColor ?? null,
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
  if (input.outputAspectRatioMode !== undefined)
    payload.output_aspect_ratio_mode = input.outputAspectRatioMode;
  if (input.userGuidanceJa !== undefined)
    payload.user_guidance_ja = input.userGuidanceJa;
  if (input.userGuidanceEn !== undefined)
    payload.user_guidance_en = input.userGuidanceEn;
  if (input.showSourceImageTypeControl !== undefined)
    payload.show_source_image_type_control = input.showSourceImageTypeControl;
  if (input.showBackgroundChangeControl !== undefined)
    payload.show_background_change_control = input.showBackgroundChangeControl;
  if (input.showGenerationModelControl !== undefined)
    payload.show_generation_model_control = input.showGenerationModelControl;
  if (input.showUserPromptInput !== undefined)
    payload.show_user_prompt_input = input.showUserPromptInput;
  if (input.userPromptLabel !== undefined)
    payload.user_prompt_label = input.userPromptLabel;
  if (input.userPromptPlaceholder !== undefined)
    payload.user_prompt_placeholder = input.userPromptPlaceholder;
  if (input.userPromptMaxLength !== undefined)
    payload.user_prompt_max_length = input.userPromptMaxLength;
  if (input.visibility !== undefined)
    payload.visibility = input.visibility;
  if (input.isCollectionSeries !== undefined)
    payload.is_collection_series = input.isCollectionSeries;
  if (input.completionThreshold !== undefined)
    payload.completion_threshold = input.completionThreshold;
  if (input.completionViewMode !== undefined)
    payload.completion_view_mode = input.completionViewMode;
  if (input.bookCoverPath !== undefined)
    payload.book_cover_path = input.bookCoverPath;
  if (input.unlockPrerequisiteKey !== undefined)
    payload.unlock_prerequisite_key = input.unlockPrerequisiteKey;
  if (input.progressiveBatchSize !== undefined)
    payload.progressive_batch_size = input.progressiveBatchSize;
  if (input.unlockAnnouncementHeroPath !== undefined)
    payload.unlock_announcement_hero_path = input.unlockAnnouncementHeroPath;
  if (input.unlockAnnouncementInitialBody !== undefined)
    payload.unlock_announcement_initial_body =
      input.unlockAnnouncementInitialBody;
  if (input.unlockAnnouncementDripBody !== undefined)
    payload.unlock_announcement_drip_body = input.unlockAnnouncementDripBody;
  if (input.unlockAnnouncementAccentColor !== undefined)
    payload.unlock_announcement_accent_color =
      input.unlockAnnouncementAccentColor;
  if (input.unlockAnnouncementAccentHoverColor !== undefined)
    payload.unlock_announcement_accent_hover_color =
      input.unlockAnnouncementAccentHoverColor;
  if (input.unlockAnnouncementTitleColor !== undefined)
    payload.unlock_announcement_title_color =
      input.unlockAnnouncementTitleColor;
  if (input.unlockAnnouncementSoftColor !== undefined)
    payload.unlock_announcement_soft_color = input.unlockAnnouncementSoftColor;
  if (input.mountTemplatePath !== undefined)
    payload.mount_template_path = input.mountTemplatePath;
  if (input.mountLayout !== undefined) payload.mount_layout = input.mountLayout;
  if (input.mountSlots !== undefined) payload.mount_slots = input.mountSlots;
  if (input.mountTemplateWidth !== undefined)
    payload.mount_template_width = input.mountTemplateWidth;
  if (input.mountTemplateHeight !== undefined)
    payload.mount_template_height = input.mountTemplateHeight;
  if (input.collectionCharacterPath !== undefined)
    payload.collection_character_path = input.collectionCharacterPath;
  if (input.collectionDisplayStartsAt !== undefined)
    payload.collection_display_starts_at = input.collectionDisplayStartsAt;
  if (input.collectionDisplayEndsAt !== undefined)
    payload.collection_display_ends_at = input.collectionDisplayEndsAt;
  if (input.progressModalFramePath !== undefined)
    payload.progress_modal_frame_path = input.progressModalFramePath;
  if (input.progressModalFrameWidth !== undefined)
    payload.progress_modal_frame_width = input.progressModalFrameWidth;
  if (input.progressModalFrameHeight !== undefined)
    payload.progress_modal_frame_height = input.progressModalFrameHeight;
  if (input.progressModalSlots !== undefined)
    payload.progress_modal_slots = input.progressModalSlots;
  if (input.progressModalButton !== undefined)
    payload.progress_modal_button = input.progressModalButton;
  if (input.progressModalCenter !== undefined)
    payload.progress_modal_center = input.progressModalCenter;
  if (input.progressModalRingColor !== undefined)
    payload.progress_modal_ring_color = input.progressModalRingColor;
  if (input.progressModalBadgeColor !== undefined)
    payload.progress_modal_badge_color = input.progressModalBadgeColor;
  if (input.progressModalBadgeTextColor !== undefined)
    payload.progress_modal_badge_text_color = input.progressModalBadgeTextColor;
  if (input.progressModalBadgeBgColor !== undefined)
    payload.progress_modal_badge_bg_color = input.progressModalBadgeBgColor;
  if (input.progressModalButtonColor !== undefined)
    payload.progress_modal_button_color = input.progressModalButtonColor;
  if (input.progressModalButtonTextColor !== undefined)
    payload.progress_modal_button_text_color =
      input.progressModalButtonTextColor;
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
