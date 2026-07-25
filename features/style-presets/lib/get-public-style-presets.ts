import { cacheLife, cacheTag } from "next/cache";
import {
  getPublishedStylePresetById,
  getPublishedStylePresetBySlug,
  listPublishedStylePresets,
} from "./style-preset-repository";
import type { StylePresetPublicSummary } from "./schema";

interface PublicStylePresetAccessOptions {
  includeAdminOnly?: boolean;
}

async function getPublishedStylePresetsCached(): Promise<
  StylePresetPublicSummary[]
> {
  "use cache";
  cacheTag("style-presets");
  cacheLife("minutes");

  return listPublishedStylePresets();
}

async function getPublishedStylePresetsForAdminCached(): Promise<
  StylePresetPublicSummary[]
> {
  "use cache";
  cacheTag("style-presets");
  cacheLife("minutes");

  return listPublishedStylePresets({ includeAdminOnly: true });
}

async function getPublishedStylePresetCached(
  id: string
): Promise<StylePresetPublicSummary | null> {
  "use cache";
  cacheTag("style-presets");
  cacheLife("minutes");

  return getPublishedStylePresetById(id);
}

async function getPublishedStylePresetBySlugCached(
  slug: string
): Promise<StylePresetPublicSummary | null> {
  "use cache";
  cacheTag("style-presets");
  cacheLife("minutes");

  return getPublishedStylePresetBySlug(slug);
}

async function getPublishedStylePresetForAdminCached(
  id: string
): Promise<StylePresetPublicSummary | null> {
  "use cache";
  cacheTag("style-presets");
  cacheLife("minutes");

  return getPublishedStylePresetById(id, { includeAdminOnly: true });
}

export async function getPublishedStylePresets(
  options: PublicStylePresetAccessOptions = {},
): Promise<StylePresetPublicSummary[]> {
  return options.includeAdminOnly === true
    ? getPublishedStylePresetsForAdminCached()
    : getPublishedStylePresetsCached();
}

export async function getPublishedStylePreset(
  id: string,
  options: PublicStylePresetAccessOptions = {},
): Promise<StylePresetPublicSummary | null> {
  return options.includeAdminOnly === true
    ? getPublishedStylePresetForAdminCached(id)
    : getPublishedStylePresetCached(id);
}

/**
 * /styles/[slug] の公開スタイル紹介ページ用。published かつ非 admin_only のみ返す。
 */
export async function getPublishedStylePresetBySlugPublic(
  slug: string
): Promise<StylePresetPublicSummary | null> {
  return getPublishedStylePresetBySlugCached(slug);
}
