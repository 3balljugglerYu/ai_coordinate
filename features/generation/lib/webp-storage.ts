/**
 * WebP画像のSupabase Storage保存機能
 * サーバーサイド専用
 */

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GeneratedImageRecord } from "./database";
import { generateThumbnailWebP, generateDisplayWebP } from "./webp-converter";

const STORAGE_BUCKET = "generated-images";

type GeneratedImageWebPRecord = {
  id: string;
  user_id: GeneratedImageRecord["user_id"];
  image_url: GeneratedImageRecord["image_url"] | null;
  storage_path: GeneratedImageRecord["storage_path"] | null;
  storage_path_thumb: GeneratedImageRecord["storage_path_thumb"] | null;
  storage_path_display: GeneratedImageRecord["storage_path_display"] | null;
  is_posted: GeneratedImageRecord["is_posted"];
};

export type EnsureWebPVariantsResult =
  | {
      status: "created";
      thumbPath: string;
      displayPath: string;
    }
  | {
      status: "skipped";
      reason: "already-exists" | "image-not-found" | "missing-source";
    };

type EnsureWebPVariantsDependencies = {
  supabase?: ReturnType<typeof createAdminClient>;
  revalidateTagFn?: typeof revalidateTag;
  uploadVariants?: typeof uploadWebPVariants;
  updateStoragePaths?: typeof updateWebPStoragePaths;
  image?: GeneratedImageWebPRecord | null;
};

function revalidateGeneratedImageTags(
  image: GeneratedImageWebPRecord,
  revalidateTagFn: typeof revalidateTag
) {
  if (image.user_id) {
    revalidateTagFn(`my-page-${image.user_id}`, "max");
    revalidateTagFn(`coordinate-${image.user_id}`, "max");
    revalidateTagFn(`my-page-image-${image.user_id}-${image.id}`, {
      expire: 0,
    });

    if (image.is_posted) {
      revalidateTagFn(`user-profile-${image.user_id}`, "max");
    }
  }

  if (image.is_posted) {
    revalidateTagFn("home-posts", "max");
    revalidateTagFn("home-posts-week", "max");
    revalidateTagFn("search-posts", "max");
    revalidateTagFn(`post-detail-${image.id}`, { expire: 0 });
  }
}

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

/**
 * 画像IDからWebP variantsの存在を保証する。
 * 既に両方存在する場合や元画像情報が欠損している場合は no-op とする。
 */
export async function ensureWebPVariants(
  imageId: string,
  deps: EnsureWebPVariantsDependencies = {}
): Promise<EnsureWebPVariantsResult> {
  const revalidateTagFn = deps.revalidateTagFn ?? revalidateTag;
  const uploadVariants = deps.uploadVariants ?? uploadWebPVariants;
  const updateStoragePaths = deps.updateStoragePaths ?? updateWebPStoragePaths;
  let image = deps.image;

  if (image === undefined) {
    const supabase = deps.supabase ?? createAdminClient();
    const { data, error } = await supabase
      .from("generated_images")
      .select(
        "id,user_id,image_url,storage_path,storage_path_thumb,storage_path_display,is_posted"
      )
      .eq("id", imageId)
      .maybeSingle();

    if (error) {
      console.error("WebP生成対象画像の取得に失敗しました:", error);
      throw new Error(`WebP生成対象画像の取得に失敗しました: ${error.message}`);
    }

    image = (data ?? null) as GeneratedImageWebPRecord | null;
  }

  if (!image) {
    return {
      status: "skipped",
      reason: "image-not-found",
    };
  }

  if (image.storage_path_thumb && image.storage_path_display) {
    return {
      status: "skipped",
      reason: "already-exists",
    };
  }

  if (!image.image_url || !image.storage_path) {
    return {
      status: "skipped",
      reason: "missing-source",
    };
  }

  const { thumbPath, displayPath } = await uploadVariants(
    image.image_url,
    image.storage_path,
    3
  );

  await updateStoragePaths(image.id, thumbPath, displayPath);
  revalidateGeneratedImageTags(image, revalidateTagFn);

  return {
    status: "created",
    thumbPath,
    displayPath,
  };
}
