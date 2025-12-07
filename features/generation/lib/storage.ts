import { createClient } from "@/lib/supabase/client";
import { base64ToBlob } from "./nanobanana";

/**
 * Supabase Storageへの画像保存機能
 */

const STORAGE_BUCKET = "generated-images";

/**
 * Base64画像をSupabase Storageにアップロード
 */
export async function uploadImageToStorage(
  base64Data: string,
  mimeType: string,
  userId: string | null
): Promise<{ path: string; url: string }> {
  const supabase = createClient();

  // Base64をBlobに変換
  const blob = base64ToBlob(base64Data, mimeType);

  // ファイル名を生成（ユーザーID or "anonymous" + タイムスタンプ + ランダム文字列）
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 15);
  const extension = mimeType.split("/")[1] || "png";
  const folder = userId || "anonymous";
  const fileName = `${folder}/${timestamp}-${randomStr}.${extension}`;

  // Supabase Storageにアップロード
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, blob, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    console.error("Storage upload error:", error);
    throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  }

  // 公開URLを取得
  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);

  return {
    path: data.path,
    url: publicUrl,
  };
}

/**
 * Data URL形式の画像をSupabase Storageにアップロード
 */
export async function uploadDataUrlToStorage(
  dataUrl: string,
  userId: string | null
): Promise<{ path: string; url: string }> {
  // Data URLをパース
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid data URL");
  }

  const mimeType = matches[1];
  const base64Data = matches[2];

  return uploadImageToStorage(base64Data, mimeType, userId);
}

/**
 * Storageから画像を削除
 */
export async function deleteImageFromStorage(path: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);

  if (error) {
    console.error("Storage delete error:", error);
    throw new Error(`画像の削除に失敗しました: ${error.message}`);
  }
}

/**
 * 複数の画像をStorageから削除
 */
export async function deleteImagesFromStorage(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  const supabase = createClient();

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);

  if (error) {
    console.error("Storage delete error:", error);
    throw new Error(`画像の削除に失敗しました: ${error.message}`);
  }
}

/**
 * FileオブジェクトをSupabase Storageにアップロード（ストック画像用）
 */
export async function uploadFileToStorage(
  file: File,
  userId: string | null,
  bucket: string = STORAGE_BUCKET
): Promise<{ path: string; url: string }> {
  const supabase = createClient();

  // ファイル名を生成（ユーザーID or "anonymous" + タイムスタンプ + ランダム文字列）
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 15);
  const extension = file.name.split(".").pop() || "png";
  const folder = userId || "anonymous";
  const fileName = `${folder}/stocks/${timestamp}-${randomStr}.${extension}`;

  // Supabase Storageにアップロード
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    console.error("Storage upload error:", error);
    throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  }

  // 公開URLを取得
  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return {
    path: data.path,
    url: publicUrl,
  };
}

