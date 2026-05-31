import { z } from "zod";
import type { StyleOutputAspectRatioMode } from "@/shared/generation/style-output-aspect-ratio";

export const STYLE_PRESET_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const STYLE_PRESET_MAX_FILE_SIZE = 5 * 1024 * 1024;

export const STYLE_PRESET_STATUS_VALUES = ["draft", "published"] as const;

export const stylePresetStatusSchema = z.enum(STYLE_PRESET_STATUS_VALUES);

export type StylePresetStatus = (typeof STYLE_PRESET_STATUS_VALUES)[number];

export const IMAGE_INPUT_MODE_VALUES = ["single", "dual"] as const;
export const imageInputModeSchema = z.enum(IMAGE_INPUT_MODE_VALUES);
export type ImageInputMode = (typeof IMAGE_INPUT_MODE_VALUES)[number];

export const STYLE_PRESET_CATEGORY_VISIBILITY_VALUES = [
  "public",
  "admin_only",
] as const;
export const stylePresetCategoryVisibilitySchema = z.enum(
  STYLE_PRESET_CATEGORY_VISIBILITY_VALUES
);
export type StylePresetCategoryVisibility =
  (typeof STYLE_PRESET_CATEGORY_VISIBILITY_VALUES)[number];

export interface StylePresetCategoryRef {
  id: string;
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  badgeColor: string;
  badgeTextColor: string;
  skipBasePrefix: boolean;
  outputAspectRatioMode: StyleOutputAspectRatioMode;
  userGuidanceJa: string | null;
  userGuidanceEn: string | null;
  showSourceImageTypeControl: boolean;
  showBackgroundChangeControl: boolean;
  showGenerationModelControl: boolean;
  visibility: StylePresetCategoryVisibility;
  isActive: boolean;
}

export interface StylePresetAdmin {
  id: string;
  slug: string;
  title: string;
  stylingPrompt: string;
  backgroundPrompt: string | null;
  thumbnailImageUrl: string;
  thumbnailStoragePath: string | null;
  thumbnailWidth: number;
  thumbnailHeight: number;
  sortOrder: number;
  status: StylePresetStatus;
  category: StylePresetCategoryRef;
  imageInputMode: ImageInputMode;
  referenceImageUrl: string | null;
  referenceImageStoragePath: string | null;
  referenceImageWidth: number | null;
  referenceImageHeight: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StylePresetPublicSummary {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  hasBackgroundPrompt: boolean;
  category: StylePresetCategoryRef;
  imageInputMode: ImageInputMode;
}

export interface StylePresetGenerationRecord extends StylePresetPublicSummary {
  stylingPrompt: string;
  backgroundPrompt: string | null;
  status: StylePresetStatus;
  referenceImageUrl: string | null;
  referenceImageStoragePath: string | null;
}

export interface StylePresetInsert {
  id?: string;
  title: string;
  stylingPrompt: string;
  backgroundPrompt?: string | null;
  thumbnailImageUrl: string;
  thumbnailStoragePath?: string | null;
  thumbnailWidth: number;
  thumbnailHeight: number;
  sortOrder?: number;
  status: StylePresetStatus;
  createdBy?: string | null;
  // category / dual モード関連: 未指定の場合 RPC 側で 'coordinate' / 'single' に
  // フォールバックする (= 既存挙動を 100% 維持)。Phase 4 で admin UI 必須化する。
  categoryId?: string;
  imageInputMode?: ImageInputMode;
  referenceImageUrl?: string | null;
  referenceImageStoragePath?: string | null;
  referenceImageWidth?: number | null;
  referenceImageHeight?: number | null;
}

export interface StylePresetUpdate {
  title?: string;
  stylingPrompt?: string;
  backgroundPrompt?: string | null;
  thumbnailImageUrl?: string;
  thumbnailStoragePath?: string | null;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  sortOrder?: number;
  status?: StylePresetStatus;
  updatedBy?: string | null;
  // 未指定なら現状値を維持する semantics。
  categoryId?: string;
  imageInputMode?: ImageInputMode;
  referenceImageUrl?: string | null;
  referenceImageStoragePath?: string | null;
  referenceImageWidth?: number | null;
  referenceImageHeight?: number | null;
}

export const stylePresetReorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});

export function normalizeStylePresetTitle(title: string): string {
  return title.trim();
}

function normalizeStylePresetText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function normalizeStylePresetPrompt(prompt: string): string {
  return normalizeStylePresetText(prompt);
}

export function normalizeStylePresetOptionalPrompt(
  prompt: string | null | undefined
): string | null {
  if (typeof prompt !== "string") {
    return null;
  }

  const normalized = normalizeStylePresetText(prompt);
  return normalized.length > 0 ? normalized : null;
}

export function buildStylePresetSlug(title: string): string {
  const normalized = normalizeStylePresetTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized.length > 0 ? normalized : "style-preset";
}
