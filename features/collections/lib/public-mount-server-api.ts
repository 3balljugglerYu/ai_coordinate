import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const GENERATED_IMAGES_BUCKET = "generated-images";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** generated-images(public バケット)の保存パスから公開URLを組み立てる */
export function buildPublicGeneratedImageUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${GENERATED_IMAGES_BUCKET}/${path}`;
}

export interface PublicMount {
  completionId: string;
  ownerId: string;
  categoryKey: string;
  displayNameJa: string;
  displayNameEn: string;
  mountImageUrl: string;
  completedAt: string | null;
  /** 台紙テンプレ実寸(px)。表示アスペクト算出用。無ければ null */
  mountTemplateWidth: number | null;
  mountTemplateHeight: number | null;
}

/**
 * 公開台紙ページ用に token(= collection_completions.id) から完了済み台紙を解決する。
 * 完了(completed)していない・存在しない・URL を組み立てられない場合は null。
 */
export async function getPublicMountByToken(
  token: string,
): Promise<PublicMount | null> {
  if (!UUID_PATTERN.test(token)) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("collection_completions")
    .select(
      "id, user_id, category_key, mount_image_path, completed_at, preset_categories(display_name_ja, display_name_en, mount_template_width, mount_template_height)",
    )
    .eq("id", token)
    .eq("mount_status", "completed")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const mountImageUrl = buildPublicGeneratedImageUrl(
    (data.mount_image_path as string | null) ?? null,
  );
  if (!mountImageUrl) {
    return null;
  }

  const category = (data as { preset_categories?: unknown }).preset_categories;
  const cat = Array.isArray(category) ? category[0] : category;
  const catRecord = (cat ?? {}) as {
    display_name_ja?: string;
    display_name_en?: string;
    mount_template_width?: number | null;
    mount_template_height?: number | null;
  };

  return {
    completionId: data.id as string,
    ownerId: data.user_id as string,
    categoryKey: data.category_key as string,
    displayNameJa: catRecord.display_name_ja ?? "",
    displayNameEn: catRecord.display_name_en ?? "",
    mountImageUrl,
    completedAt: (data.completed_at as string | null) ?? null,
    mountTemplateWidth: catRecord.mount_template_width ?? null,
    mountTemplateHeight: catRecord.mount_template_height ?? null,
  };
}
