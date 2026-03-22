import { cacheLife, cacheTag } from "next/cache";
import {
  getPublishedStylePresetById,
  listPublishedStylePresets,
} from "./style-preset-repository";
import type { StylePresetPublicSummary } from "./schema";

async function getPublishedStylePresetsCached(): Promise<
  StylePresetPublicSummary[]
> {
  "use cache";
  cacheTag("style-presets");
  cacheLife("minutes");

  return listPublishedStylePresets();
}

async function getPublishedStylePresetCached(
  id: string
): Promise<StylePresetPublicSummary | null> {
  "use cache";
  cacheTag("style-presets");
  cacheLife("minutes");

  return getPublishedStylePresetById(id);
}

export {
  getPublishedStylePresetCached as getPublishedStylePreset,
  getPublishedStylePresetsCached as getPublishedStylePresets,
};
