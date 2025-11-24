/**
 * 投稿機能のユーティリティ関数
 */

/**
 * 数値を短縮表示にフォーマット（K/M形式）
 * @param num フォーマットする数値
 * @returns フォーマットされた文字列（例: "1.2K", "10K", "100K", "1M"）
 */
export function formatNumber(num: number): string {
  if (num < 1000) {
    return num.toString();
  }

  if (num < 1000000) {
    const k = num / 1000;
    // 小数点以下1桁で表示、.0の場合は省略
    const formatted = k % 1 === 0 ? k.toString() : k.toFixed(1);
    return `${formatted}K`;
  }

  const m = num / 1000000;
  // 小数点以下1桁で表示、.0の場合は省略
  const formatted = m % 1 === 0 ? m.toString() : m.toFixed(1);
  return `${formatted}M`;
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

