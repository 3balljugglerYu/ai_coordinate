import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 台紙の各スロットに置く「うちの子の代表シール」を取得する。
 *
 * スロットは category の style_presets を display_order 順に並べた先頭から
 * `limit`(= レイアウトのスロット数 = N) 個。各 preset について、当該ユーザーの
 * 最新の one_tap_style 生成画像(generation_metadata.oneTapStyle.id = preset.id)を
 * 代表として用いる。
 *
 * 前提: コレクションシリーズのカテゴリは preset 数 = N で運用する(計画書 ADR-001)。
 * preset 数が N を超える場合は display_order 先頭 N 個をスロットに割り当てる。
 */
export interface RepresentativeImage {
  presetId: string;
  storagePath: string;
  imageUrl: string;
}

export async function getRepresentativeImagesForCategory(params: {
  userId: string;
  categoryId: string;
  limit: number;
}): Promise<RepresentativeImage[]> {
  const supabase = createAdminClient();

  const { data: presets, error: presetError } = await supabase
    .from("style_presets")
    .select("id, display_order")
    .eq("category_id", params.categoryId)
    .order("display_order", { ascending: true })
    .limit(params.limit);
  if (presetError) {
    throw presetError;
  }

  const results: RepresentativeImage[] = [];
  for (const preset of presets ?? []) {
    const presetId = preset.id as string;
    const { data: images, error: imageError } = await supabase
      .from("generated_images")
      .select("storage_path, image_url")
      .eq("user_id", params.userId)
      .eq("generation_type", "one_tap_style")
      // jsonb パスでの絞り込み(PostgREST): generation_metadata->oneTapStyle->>id
      .eq("generation_metadata->oneTapStyle->>id", presetId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (imageError) {
      throw imageError;
    }
    const row = images?.[0];
    if (row?.storage_path && row?.image_url) {
      results.push({
        presetId,
        storagePath: row.storage_path as string,
        imageUrl: row.image_url as string,
      });
    }
  }

  return results;
}
