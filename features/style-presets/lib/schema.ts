import { z } from "zod";

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
}

export interface StylePresetGenerationRecord extends StylePresetPublicSummary {
  stylingPrompt: string;
  backgroundPrompt: string | null;
  status: StylePresetStatus;
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
