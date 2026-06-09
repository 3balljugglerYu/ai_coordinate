import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { RepresentativeImage } from "./representative-images";

/**
 * ユーザーが台紙に載せる画像を「衣装ごとに明示指定」した場合に、それを検証して
 * スロット順(sort_order 昇順)の代表画像配列に解決する。
 *
 * selections: { [presetId]: generatedImageId }
 * - 各画像が本人の one_tap_style 生成物で、その衣装(oneTapStyle.id === presetId)であること、
 *   preset がカテゴリに属することを検証する(なりすまし・他衣装混入を防ぐ)。
 * - 件数がスロット数と一致しない/検証に失敗した場合は例外。
 */
export async function resolveSelectedImages(params: {
  userId: string;
  categoryId: string;
  selections: Record<string, string>;
  slotCount: number;
}): Promise<RepresentativeImage[]> {
  const supabase = createAdminClient();

  const presetIds = Object.keys(params.selections);
  if (presetIds.length !== params.slotCount) {
    throw new Error(
      `selections count mismatch: ${presetIds.length} of ${params.slotCount}`,
    );
  }

  const { data: presets, error: presetError } = await supabase
    .from("style_presets")
    .select("id, sort_order")
    .eq("category_id", params.categoryId);
  if (presetError) throw presetError;
  const sortOrderByPreset = new Map<string, number>();
  for (const p of presets ?? []) {
    sortOrderByPreset.set(p.id as string, (p.sort_order as number) ?? 0);
  }

  const imageIds = presetIds.map((pid) => params.selections[pid]);
  const { data: images, error: imageError } = await supabase
    .from("generated_images")
    .select("id, storage_path, image_url, generation_metadata")
    .eq("user_id", params.userId)
    .eq("generation_type", "one_tap_style")
    .in("id", imageIds);
  if (imageError) throw imageError;

  const rowById = new Map<string, Record<string, unknown>>();
  for (const row of images ?? []) {
    rowById.set(row.id as string, row as Record<string, unknown>);
  }

  const result: RepresentativeImage[] = [];
  for (const presetId of presetIds) {
    if (!sortOrderByPreset.has(presetId)) {
      throw new Error(`preset not in category: ${presetId}`);
    }
    const imageId = params.selections[presetId];
    const row = rowById.get(imageId);
    if (!row) {
      throw new Error(`selected image not found or not owned: ${imageId}`);
    }
    const meta = row.generation_metadata as
      | { oneTapStyle?: { id?: unknown } }
      | null;
    const outfitId =
      typeof meta?.oneTapStyle?.id === "string" ? meta.oneTapStyle.id : null;
    if (outfitId !== presetId) {
      throw new Error(`selected image outfit mismatch: ${imageId}`);
    }
    const storagePath = row.storage_path as string | null;
    const imageUrl = row.image_url as string | null;
    if (!storagePath || !imageUrl) {
      throw new Error(`selected image incomplete: ${imageId}`);
    }
    result.push({ presetId, storagePath, imageUrl });
  }

  return result.sort(
    (a, b) =>
      (sortOrderByPreset.get(a.presetId) ?? 0) -
      (sortOrderByPreset.get(b.presetId) ?? 0),
  );
}
