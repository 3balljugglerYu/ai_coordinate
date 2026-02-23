/**
 * バナー画像のSupabase Storage保存機能
 * サーバーサイド専用（createAdminClient使用）
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { convertToWebP } from "@/features/generation/lib/webp-converter";

const STORAGE_BUCKET = "banners";

/**
 * バナー画像をWebP形式に変換してSupabase Storageにアップロード
 * @param file アップロードする画像ファイル
 * @param bannerId バナーID（ファイル名に使用）
 * @returns 公開URLとストレージパス
 */
export async function uploadBannerImage(
  file: File,
  bannerId: string
): Promise<{ imageUrl: string; storagePath: string }> {
  const supabase = createAdminClient();

  // バケットが存在しない場合は作成（初回のみ）
  try {
    await supabase.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024, // 5MB
      allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"],
    });
  } catch {
    // バケットが既に存在する場合はエラーになるが無視
  }

  // FileをBufferに変換
  const arrayBuffer = await file.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);

  // WebP変換（長辺1280px、quality 85、バナー用）
  const webpBuffer = await convertToWebP(imageBuffer, {
    maxWidth: 1280,
    quality: 85,
  });

  const path = `${bannerId}.webp`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, webpBuffer, {
      contentType: "image/webp",
      upsert: true,
    });

  if (error) {
    console.error("Banner storage upload error:", error);
    throw new Error(`バナー画像のアップロードに失敗しました: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);

  return {
    imageUrl: publicUrl,
    storagePath: data.path,
  };
}

/**
 * バナー画像をStorageから削除
 */
export async function deleteBannerImage(storagePath: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([storagePath]);

  if (error) {
    console.error("Banner storage delete error:", error);
    throw new Error(`バナー画像の削除に失敗しました: ${error.message}`);
  }
}
