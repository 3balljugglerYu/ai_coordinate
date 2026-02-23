import { env } from "@/lib/env";

/**
 * URLがSupabase StorageのURLであることを検証
 * セキュリティのため、許可されたドメインのみを許可
 */
export function isValidSupabaseStorageUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const urlObj = new URL(url);
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseUrl) {
      // 環境変数が設定されていない場合は、開発環境でのみ警告
      if (process.env.NODE_ENV === "development") {
        console.warn("NEXT_PUBLIC_SUPABASE_URL is not set, cannot validate URL");
      }
      return false;
    }

    const supabaseUrlObj = new URL(supabaseUrl);

    // オリジン（プロトコル + ホスト）が一致することを確認
    if (urlObj.origin !== supabaseUrlObj.origin) {
      return false;
    }

    // Supabase Storageのパスであることを確認
    // 形式: /storage/v1/object/public/{bucket}/{path}
    const storagePathPattern = /^\/storage\/v1\/object\/public\/[^/]+\/.+$/;
    if (!storagePathPattern.test(urlObj.pathname)) {
      return false;
    }

    // 許可されたバケット名のみを許可（セキュリティのため）
    const allowedBuckets = [
      "generated-images",
      "materials_images", // フリー素材画像
      "banners", // バナー画像
    ];
    const bucketMatch = urlObj.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\//);
    if (!bucketMatch || !allowedBuckets.includes(bucketMatch[1])) {
      return false;
    }

    return true;
  } catch {
    // URLのパースに失敗した場合は無効
    return false;
  }
}

/**
 * URLが安全にfetchできることを検証
 * 許可されたSupabase StorageのURLのみを許可
 */
export function validateImageUrl(url: string): void {
  if (!isValidSupabaseStorageUrl(url)) {
    throw new Error(
      "画像URLが無効です。Supabase StorageのURLのみが許可されています。"
    );
  }
}
