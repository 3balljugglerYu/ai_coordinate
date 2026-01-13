/**
 * WebP画像のSupabase Storage保存機能
 * サーバーサイド専用
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateThumbnailWebP, generateDisplayWebP } from "./webp-converter";

const STORAGE_BUCKET = "generated-images";

/**
 * 画像をWebP形式に変換してSupabase Storageにアップロード（リトライ機能付き）
 * @param imageUrl 元画像のURL
 * @param originalStoragePath 元画像のストレージパス（ファイル名生成用）
 * @param maxRetries 最大リトライ回数（デフォルト: 3）
 * @returns サムネイルと表示用のストレージパス
 */
export async function uploadWebPVariants(
  imageUrl: string,
  originalStoragePath: string,
  maxRetries: number = 3
): Promise<{ thumbPath: string; displayPath: string }> {
  const supabase = createAdminClient();

  // 元画像のファイル名から拡張子を除いた部分を取得
  const pathWithoutExt = originalStoragePath.replace(/\.[^.]+$/, "");

  // サムネイルWebPを生成・アップロード（リトライ付き）
  let thumbPath: string;
  let retryCount = 0;
  while (retryCount < maxRetries) {
    try {
      const thumbWebP = await generateThumbnailWebP(imageUrl);
      const thumbFileName = `${pathWithoutExt}_thumb.webp`;
      const { data: thumbData, error: thumbError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(thumbFileName, thumbWebP, {
          contentType: "image/webp",
          upsert: true, // 既存ファイルがある場合は上書き
        });

      if (thumbError) {
        throw new Error(`サムネイルWebPのアップロードに失敗しました: ${thumbError.message}`);
      }

      thumbPath = thumbData.path;
      break; // 成功したらループを抜ける
    } catch (error) {
      retryCount++;
      if (retryCount >= maxRetries) {
        console.error(`サムネイルWebP生成・アップロードが${maxRetries}回失敗しました:`, error);
        throw error;
      }
      console.warn(`サムネイルWebP生成・アップロードに失敗（${retryCount}/${maxRetries}回目）:`, error);
      // リトライ前に少し待機（指数バックオフ）
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
    }
  }

  // 表示用WebPを生成・アップロード（リトライ付き）
  let displayPath: string;
  retryCount = 0;
  while (retryCount < maxRetries) {
    try {
      const displayWebP = await generateDisplayWebP(imageUrl);
      const displayFileName = `${pathWithoutExt}_display.webp`;
      const { data: displayData, error: displayError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(displayFileName, displayWebP, {
          contentType: "image/webp",
          upsert: true, // 既存ファイルがある場合は上書き
        });

      if (displayError) {
        throw new Error(`表示用WebPのアップロードに失敗しました: ${displayError.message}`);
      }

      displayPath = displayData.path;
      break; // 成功したらループを抜ける
    } catch (error) {
      retryCount++;
      if (retryCount >= maxRetries) {
        console.error(`表示用WebP生成・アップロードが${maxRetries}回失敗しました:`, error);
        throw error;
      }
      console.warn(`表示用WebP生成・アップロードに失敗（${retryCount}/${maxRetries}回目）:`, error);
      // リトライ前に少し待機（指数バックオフ）
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
    }
  }

  return {
    thumbPath: thumbPath!,
    displayPath: displayPath!,
  };
}

/**
 * データベースのstorage_path_displayとstorage_path_thumbを更新（サーバーサイド専用）
 * @param imageId 画像ID
 * @param thumbPath サムネイルWebPのストレージパス
 * @param displayPath 表示用WebPのストレージパス
 */
export async function updateWebPStoragePaths(
  imageId: string,
  thumbPath: string,
  displayPath: string
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("generated_images")
    .update({
      storage_path_thumb: thumbPath,
      storage_path_display: displayPath,
    })
    .eq("id", imageId);

  if (error) {
    console.error("WebPストレージパスの更新に失敗しました:", error);
    throw new Error(`WebPストレージパスの更新に失敗しました: ${error.message}`);
  }
}
