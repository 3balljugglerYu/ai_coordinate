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

export interface ImageDimensions {
  width: number;
  height: number;
}

function getPngDimensions(buffer: Buffer): ImageDimensions | null {
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }

  return null;
}

function getJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 8 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }

    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset++;
    }

    if (offset >= buffer.length) {
      break;
    }

    const marker = buffer[offset];
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 2 >= buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset + 1);
    if (segmentLength < 2 || offset + 1 + segmentLength > buffer.length) {
      break;
    }

    const isSofMarker =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSofMarker && offset + 7 < buffer.length) {
      const height = buffer.readUInt16BE(offset + 4);
      const width = buffer.readUInt16BE(offset + 6);
      if (width > 0 && height > 0) {
        return { width, height };
      }
      break;
    }

    offset += segmentLength + 1;
  }

  return null;
}

function getWebPDimensions(buffer: Buffer): ImageDimensions | null {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType === "VP8X" && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }

  if (chunkType === "VP8 " && buffer.length >= 30) {
    const hasStartCode =
      buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a;
    if (hasStartCode) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }
  }

  if (chunkType === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    const width = 1 + (b0 | ((b1 & 0x3f) << 8));
    const height = 1 + (((b1 & 0xc0) >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10));
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }

  return null;
}

function readImageDimensionsFromBuffer(buffer: Buffer): ImageDimensions | null {
  return (
    getPngDimensions(buffer) ??
    getJpegDimensions(buffer) ??
    getWebPDimensions(buffer)
  );
}

/**
 * 画像の寸法をサーバー側で取得する
 * 対応形式: PNG / JPEG / WebP
 */
export async function getImageDimensions(imageUrl: string): Promise<ImageDimensions | null> {
  try {
    const response = await fetch(imageUrl, {
      method: "GET",
      headers: {
        Range: "bytes=0-65535",
      },
    });

    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return readImageDimensionsFromBuffer(buffer);
  } catch (error) {
    console.error("Failed to get image dimensions:", error);
    return null;
  }
}

/**
 * 画像のアスペクト比をサーバー側で計算
 * 画像の寸法を読み込んで判定
 * @param imageUrl 画像のURL
 * @returns "portrait" | "landscape" | null
 */
export async function getImageAspectRatio(imageUrl: string): Promise<"portrait" | "landscape" | null> {
  try {
    const dimensions = await getImageDimensions(imageUrl);
    if (!dimensions) {
      return null;
    }

    return dimensions.height > dimensions.width ? "portrait" : "landscape";
  } catch (error) {
    console.error("Failed to get image aspect ratio:", error);
    return null;
  }
}
