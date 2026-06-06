import "server-only";

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * claim された画像を Supabase Storage に upload し、`generated_images` に
 * 1 行 insert してワードローブへ保存する境界 (boundary) 関数。
 *
 * - 既存 style 生成と同じ `generation_type='one_tap_style'` で入れ、出所は
 *   `generation_metadata.source='guest_wardrobe_claim'` で区別 (generation_type の
 *   マイグレーションを避ける)。
 * - `style_template_id` は FK 不一致リスクを避けて null とし、styleId は metadata に保持。
 * - 本人の private 画像 (`is_posted=false`) で、ゲスト生成パイプラインで既に
 *   上流 safety を通過済みのため `moderation_status='visible'`。
 */

const STORAGE_BUCKET = "generated-images";

export interface SaveWardrobeImageInput {
  userId: string;
  imageBuffer: Buffer;
  contentType: string;
  styleId: string | null;
  prompt: string | null;
  model: string | null;
  width: number | null;
  height: number | null;
}

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg" || contentType === "image/jpg") return "jpg";
  // contentType は handler で {png,jpeg,jpg,webp} に検証済みのため webp に集約
  return "webp";
}

export async function saveWardrobeImage(
  input: SaveWardrobeImageInput,
): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const ext = extensionFor(input.contentType);
  const storagePath = `${input.userId}/wardrobe/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, input.imageBuffer, {
      contentType: input.contentType,
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`Wardrobe image upload failed: ${uploadError.message}`);
  }

  // image_url は NOT NULL のため、アップロード先の URL を必ず入れる。
  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from("generated_images")
    .insert({
      user_id: input.userId,
      // NOT NULL 列: image_url / storage_path / prompt は必ず非 null を入れる
      image_url: publicUrl,
      storage_path: storagePath,
      storage_path_display: storagePath,
      storage_path_thumb: storagePath,
      generation_type: "one_tap_style",
      prompt: input.prompt ?? "",
      model: input.model,
      width: input.width,
      height: input.height,
      is_posted: false,
      moderation_status: "visible",
      generation_metadata: {
        source: "guest_wardrobe_claim",
        styleId: input.styleId,
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    // insert 失敗時はアップロード済みオブジェクトを掃除して孤児を残さない
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath])
      .catch(() => {});
    throw new Error(
      `Wardrobe image insert failed: ${error?.message ?? "no row returned"}`,
    );
  }

  return { id: data.id as string };
}

/**
 * 指定時刻 (epoch ms) が属する JST の日の 0:00 を UTC ISO 文字列で返す。
 * ゲスト生成の日次境界 (JST) に合わせるための純粋関数 (テスト可能)。
 */
export function jstStartOfDayIso(nowMs: number): string {
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const jst = new Date(nowMs + jstOffsetMs);
  const jstMidnightAsUtc = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
  );
  return new Date(jstMidnightAsUtc - jstOffsetMs).toISOString();
}

/**
 * 当該ユーザーが JST 本日中に claim 保存した枚数を数える (1 日上限ガード用)。
 * `generation_metadata.source='guest_wardrobe_claim'` の行のみを対象にする。
 */
export async function countTodaysWardrobeClaims(
  userId: string,
): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("generated_images")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("generation_metadata->>source", "guest_wardrobe_claim")
    .gte("created_at", jstStartOfDayIso(Date.now()));

  if (error) {
    throw new Error(`Count wardrobe claims failed: ${error.message}`);
  }
  return count ?? 0;
}
