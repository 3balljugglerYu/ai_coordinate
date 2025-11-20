/**
 * 投稿機能のユーティリティ関数
 */

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

