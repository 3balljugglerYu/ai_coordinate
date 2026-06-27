import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 台紙の各スロットに置く「うちの子の代表シール」を取得する。
 *
 * スロットは「カテゴリの先頭N preset」ではなく、**ユーザーが実際に集めた衣装**で
 * 埋める(計画書 指摘1 の (B) 改修)。コンプリート条件は「N種(どの衣装でも)」なので、
 * カテゴリの preset 数が N を超えても、ユーザーが集めた衣装で台紙を完成できる。
 *
 * - 同じ衣装を複数回作っている場合は最新の1枚を代表に採用する。
 * - 並び順は preset の sort_order 昇順(台紙のコマは番号ラベルのみで特定衣装に
 *   紐づかない前提)。集めた衣装が N を超える場合は先頭 limit(=N) 個を採用する。
 *
 * 注意: 将来「コマに特定衣装名が刷り込まれた台紙」を使う場合は、コマと衣装の対応を
 * 固定する必要があるため別途設計が要る(本実装は番号ラベルの台紙を前提)。
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

  // 1. カテゴリに属する preset の id → sort_order を引く
  const { data: presets, error: presetError } = await supabase
    .from("style_presets")
    .select("id, sort_order")
    .eq("category_id", params.categoryId);
  if (presetError) {
    throw presetError;
  }
  const sortOrderByPreset = new Map<string, number>();
  for (const p of presets ?? []) {
    sortOrderByPreset.set(p.id as string, (p.sort_order as number) ?? 0);
  }
  const presetIds = Array.from(sortOrderByPreset.keys());
  if (presetIds.length === 0) {
    return [];
  }

  // 2. ユーザーが当該カテゴリの衣装で生成した画像を新しい順に取得
  const { data: images, error: imageError } = await supabase
    .from("generated_images")
    .select("storage_path, image_url, created_at, generation_metadata")
    .eq("user_id", params.userId)
    .eq("generation_type", "one_tap_style")
    .in("generation_metadata->oneTapStyle->>id", presetIds)
    .order("created_at", { ascending: false });
  if (imageError) {
    throw imageError;
  }

  // 3. 衣装(preset id)ごとに最新1枚を代表に採用(降順なので最初に出たものが最新)
  const repByPreset = new Map<string, RepresentativeImage>();
  for (const row of images ?? []) {
    const meta = row.generation_metadata as
      | { oneTapStyle?: { id?: unknown } }
      | null;
    const presetId =
      typeof meta?.oneTapStyle?.id === "string" ? meta.oneTapStyle.id : null;
    if (!presetId || !sortOrderByPreset.has(presetId)) continue;
    if (repByPreset.has(presetId)) continue; // 既に最新を採用済み
    const storagePath = row.storage_path as string | null;
    const imageUrl = row.image_url as string | null;
    if (!storagePath || !imageUrl) continue;
    repByPreset.set(presetId, { presetId, storagePath, imageUrl });
  }

  // 4. 集めた衣装を sort_order 昇順に並べ、先頭 limit(=N) 個を採用
  //    sort_order 同値(重複/未設定)時は presetId で安定化し、
  //    book のページ順(Day順)が非決定的にならないようにする。
  return Array.from(repByPreset.values())
    .sort(
      (a, b) =>
        (sortOrderByPreset.get(a.presetId) ?? 0) -
          (sortOrderByPreset.get(b.presetId) ?? 0) ||
        a.presetId.localeCompare(b.presetId),
    )
    .slice(0, params.limit);
}
