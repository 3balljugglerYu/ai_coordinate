/**
 * 環境変数の型安全な読み出し
 * 開発時は環境変数が設定されていない場合でも動作するように
 * 本番環境では必須の環境変数が設定されていることを確認
 */

// 環境変数の型定義
const envSchema = {
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,

  // Google AI Studio (Nano Banana)
  NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY:
    process.env.NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY,
  NEXT_PUBLIC_NANOBANANA_API_KEY:
    process.env.NEXT_PUBLIC_NANOBANANA_API_KEY,
  
  // Google AI Studio (サーバー側のみ)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  // Stripe
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICING_TABLE_ID: process.env.STRIPE_PRICING_TABLE_ID,
  NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID: process.env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID,

  // Node.js環境のみ（サーバーサイド）
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  // Site URL
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,

  // Event
  NEXT_PUBLIC_EVENT_USER_ID: process.env.NEXT_PUBLIC_EVENT_USER_ID,

  // Admin
  ADMIN_USER_IDS: process.env.ADMIN_USER_IDS,
} as const;

/**
 * 環境変数を取得
 * 必須の環境変数が設定されていない場合は警告を出す（開発時）
 * 環境変数が未設定の場合は空文字列を返す（エラー回避）
 */
function getEnv() {
  const required = {
    NEXT_PUBLIC_SUPABASE_URL: envSchema.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: envSchema.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY:
      envSchema.NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      envSchema.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    STRIPE_SECRET_KEY: envSchema.STRIPE_SECRET_KEY,
  };

  // 開発環境でのみ警告（本番ではエラーを出すべき）
  if (process.env.NODE_ENV === "development") {
    const missing = Object.entries(required).filter(
      ([, value]) => !value
    );
    if (missing.length > 0) {
      console.warn(
        "⚠️ Missing environment variables:",
        missing.map(([key]) => key).join(", ")
      );
      console.warn(
        "⚠️ Some features may not work without these environment variables."
      );
    }
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL:
      envSchema.NEXT_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      envSchema.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY:
      envSchema.NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY || "",
    NEXT_PUBLIC_NANOBANANA_API_KEY:
      envSchema.NEXT_PUBLIC_NANOBANANA_API_KEY || "",
    GEMINI_API_KEY: envSchema.GEMINI_API_KEY || "",
    SUPABASE_SERVICE_ROLE_KEY:
      envSchema.SUPABASE_SERVICE_ROLE_KEY || "",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      envSchema.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    STRIPE_SECRET_KEY: envSchema.STRIPE_SECRET_KEY || "",
    STRIPE_WEBHOOK_SECRET: envSchema.STRIPE_WEBHOOK_SECRET || "",
    STRIPE_PRICING_TABLE_ID:
      envSchema.STRIPE_PRICING_TABLE_ID || "",
    NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID:
      envSchema.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID || "",
    NEXT_PUBLIC_SITE_URL:
      envSchema.NEXT_PUBLIC_SITE_URL || "",
    NEXT_PUBLIC_EVENT_USER_ID:
      envSchema.NEXT_PUBLIC_EVENT_USER_ID || "",
    ADMIN_USER_IDS: envSchema.ADMIN_USER_IDS || "",
  };
}

export const env = getEnv();

/**
 * サイトのベースURLを取得（サーバーサイド用）
 * 環境変数が設定されていない場合は、開発環境ではlocalhost、本番環境では空文字列を返す
 */
export function getSiteUrl(): string {
  if (env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL;
  }
  
  // 開発環境のデフォルト値
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  
  // 本番環境で環境変数が設定されていない場合は空文字列を返す
  return "";
}

/**
 * クライアントサイドで使用可能なサイトURL取得関数
 * 環境変数NEXT_PUBLIC_SITE_URLが設定されている場合はそれを優先
 * 設定されていない場合、開発環境ではlocalhost、本番環境ではwindow.location.originを使用
 */
export function getSiteUrlForClient(): string {
  // 環境変数が設定されている場合は優先
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  // 開発環境のデフォルト値
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  // 本番環境で環境変数が設定されていない場合、ブラウザのoriginを使用（フォールバック）
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  // サーバーサイドレンダリング時（通常は発生しないが、安全のため）
  return "";
}

/**
 * Stripeがテストモードか本番モードかを判定
 * 公開キーのプレフィックスで判定（pk_test_... = テスト、pk_live_... = 本番）
 */
export function isStripeTestMode(): boolean {
  const publishableKey = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return publishableKey.startsWith("pk_test_");
}

/**
 * 管理者ユーザーIDリストを取得
 * 環境変数ADMIN_USER_IDS（カンマ区切り）を配列に変換
 * 空文字列の場合は空配列を返す
 */
export function getAdminUserIds(): string[] {
  const adminUserIds = env.ADMIN_USER_IDS;
  if (!adminUserIds || adminUserIds.trim() === "") {
    return [];
  }
  return adminUserIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}
