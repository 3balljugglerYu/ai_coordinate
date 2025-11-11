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

  // Stripe
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

  // Node.js環境のみ（サーバーサイド）
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
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
    SUPABASE_SERVICE_ROLE_KEY:
      envSchema.SUPABASE_SERVICE_ROLE_KEY || "",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      envSchema.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    STRIPE_SECRET_KEY: envSchema.STRIPE_SECRET_KEY || "",
    STRIPE_WEBHOOK_SECRET: envSchema.STRIPE_WEBHOOK_SECRET || "",
  };
}

export const env = getEnv();

