import "server-only";

import { createClient } from "@/lib/supabase/server";
import { PICKER_GENERATION_TYPES, type PickerSourceItem } from "../types";

export interface GetGeneratedImagesForPickerParams {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface GetGeneratedImagesForPickerResult {
  items: Extract<PickerSourceItem, { kind: "generated" }>[];
  nextOffset: number | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * 画像ソースピッカー「生成済み」タブの一覧を取得する。
 *
 * `PICKER_GENERATION_TYPES` に含まれる generation_type の generated_images を、
 * 認可済みユーザーに対して最新順で `limit` 件返す。`limit + 1` 件取得して
 * 「次ページが存在するか」を判定し、`nextOffset` で示す。
 *
 * このモジュールは server-only。RLS / 認証は呼び出し側 (API route handler) で
 * `getUser()` を済ませてから user.id を渡すこと。
 */
export async function getGeneratedImagesForPicker(
  params: GetGeneratedImagesForPickerParams
): Promise<GetGeneratedImagesForPickerResult> {
  const limit = Math.min(
    Math.max(params.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const offset = Math.max(params.offset ?? 0, 0);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("generated_images")
    .select("id, image_url, storage_path, created_at, generation_type")
    .eq("user_id", params.userId)
    .in("generation_type", PICKER_GENERATION_TYPES as unknown as string[])
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) {
    throw new Error(`generated_images fetch failed: ${error.message}`);
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: trimmed.map((row) => ({
      kind: "generated" as const,
      id: row.id,
      imageUrl: row.image_url,
      storagePath: row.storage_path,
      createdAt: row.created_at,
      generationType: row.generation_type ?? null,
    })),
    nextOffset: hasMore ? offset + limit : null,
  };
}
