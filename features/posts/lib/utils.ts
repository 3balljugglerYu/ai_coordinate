/**
 * 投稿機能のユーティリティ関数
 */

import type { SortType } from "../types";

/**
 * SortTypeの型ガード関数
 * 文字列が有効なSortTypeかどうかを判定する
 */
export function isValidSortType(value: string): value is SortType {
  const validSorts: SortType[] = ["newest", "following", "daily", "week", "month", "popular"];
  return validSorts.includes(value as SortType);
}

/**
 * storage_pathからSupabase Storageの公開URLを生成（クライアント・サーバー両対応）
 */
export function getImageUrlFromStoragePath(storagePath: string): string {
  // NEXT_PUBLIC_*環境変数はクライアントサイドでも利用可能
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn("NEXT_PUBLIC_SUPABASE_URL is not set");
    return "";
  }

  // Supabase Storageの公開URL形式: {SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{PATH}
  const bucket = "generated-images";
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;
}

/**
 * 投稿の画像URLを取得（image_urlが存在する場合はそれを使用、なければstorage_pathから生成）
 */
export function getPostImageUrl(post: { image_url?: string | null; storage_path?: string | null }): string {
  if (post.image_url) {
    return post.image_url;
  }

  if (post.storage_path) {
    return getImageUrlFromStoragePath(post.storage_path);
  }

  return "";
}

/**
 * 投稿のサムネイル画像URLを取得（一覧表示用、WebP優先、フォールバック付き）
 */
export function getPostThumbUrl(post: { 
  storage_path_thumb?: string | null; 
  storage_path?: string | null; 
  image_url?: string | null; 
}): string {
  // WebPサムネイルが存在する場合はそれを使用
  if (post.storage_path_thumb) {
    return getImageUrlFromStoragePath(post.storage_path_thumb);
  }
  
  // フォールバック：既存のロジックを使用
  return getPostImageUrl(post);
}

/**
 * 投稿の表示用画像URLを取得（詳細表示用、WebP優先、フォールバック付き）
 */
export function getPostDisplayUrl(post: { 
  storage_path_display?: string | null; 
  storage_path?: string | null; 
  image_url?: string | null; 
}): string {
  // WebP表示用が存在する場合はそれを使用
  if (post.storage_path_display) {
    return getImageUrlFromStoragePath(post.storage_path_display);
  }
  
  // フォールバック：既存のロジックを使用
  return getPostImageUrl(post);
}

/**
 * 投稿の元画像URLを取得（ダウンロード用、PNG/JPEG）
 */
export function getPostOriginalUrl(post: { 
  storage_path?: string | null; 
  image_url?: string | null; 
}): string {
  // 既存のロジックを使用（元画像は常にPNG/JPEG）
  return getPostImageUrl(post);
}

/**
 * 画像のアスペクト比をサーバー側で計算
 * 画像のメタデータを読み込んで判定（簡易版）
 * @param imageUrl 画像のURL
 * @returns "portrait" | "landscape" | null
 */
export async function getImageAspectRatio(imageUrl: string): Promise<"portrait" | "landscape" | null> {
  try {
    // 画像のメタデータを取得するために、画像を読み込む
    const response = await fetch(imageUrl, {
      method: "GET",
      headers: {
        Range: "bytes=0-16384", // 最初の16KBのみ取得（メタデータに十分）
      },
    });

    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // PNG形式の場合
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      if (buffer.length >= 24) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        if (width > 0 && height > 0) {
          return height > width ? "portrait" : "landscape";
        }
      }
    }

    // JPEG形式の場合
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] === 0xff && buffer[offset + 1] === 0xc0) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          if (width > 0 && height > 0) {
            return height > width ? "portrait" : "landscape";
          }
          break;
        }
        offset++;
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to get image aspect ratio:", error);
    return null;
  }
}

