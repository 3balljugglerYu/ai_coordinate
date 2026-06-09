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

  // Google AI Studio (サーバー側のみ)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  // Stripe
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_SECRET_KEY_TEST: process.env.STRIPE_SECRET_KEY_TEST,
  STRIPE_SECRET_KEY_LIVE: process.env.STRIPE_SECRET_KEY_LIVE,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_WEBHOOK_SECRET_TEST: process.env.STRIPE_WEBHOOK_SECRET_TEST,
  STRIPE_WEBHOOK_SECRET_LIVE: process.env.STRIPE_WEBHOOK_SECRET_LIVE,
  STRIPE_PRICING_TABLE_ID: process.env.STRIPE_PRICING_TABLE_ID,
  NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID: process.env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID,

  // Node.js環境のみ（サーバーサイド）
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  // Site URL
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,

  // Event
  NEXT_PUBLIC_EVENT_USER_ID: process.env.NEXT_PUBLIC_EVENT_USER_ID,

  // Google Analytics 4
  NEXT_PUBLIC_GA4_MEASUREMENT_ID:
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
  GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID,
  GA4_SERVICE_ACCOUNT_JSON_BASE64:
    process.env.GA4_SERVICE_ACCOUNT_JSON_BASE64,
  GA4_BIGQUERY_PROJECT_ID: process.env.GA4_BIGQUERY_PROJECT_ID,
  GA4_BIGQUERY_DATASET: process.env.GA4_BIGQUERY_DATASET,
  GA4_BIGQUERY_LOCATION: process.env.GA4_BIGQUERY_LOCATION,

  // Admin
  ADMIN_USER_IDS: process.env.ADMIN_USER_IDS,
  // 「admin 公開コンテンツ閲覧のみ」を許可するプレビュー権限ユーザー(任意, csv)。
  // /admin/* 管理画面と requireAdmin 系 API は許可されない。
  ADMIN_PREVIEW_USER_IDS: process.env.ADMIN_PREVIEW_USER_IDS,

  // Account deletion / purge
  ACCOUNT_PURGE_CRON_SECRET: process.env.ACCOUNT_PURGE_CRON_SECRET,
  ACCOUNT_FORFEITURE_HASH_SALT: process.env.ACCOUNT_FORFEITURE_HASH_SALT,
  STYLE_RATE_LIMIT_HASH_SALT: process.env.STYLE_RATE_LIMIT_HASH_SALT,
  CRON_SECRET: process.env.CRON_SECRET,

  // Resend (お問い合わせメール送信)
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  CONTACT_EMAIL: process.env.CONTACT_EMAIL,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,

  // Inspire（ユーザー投稿スタイルテンプレート機能）
  // 機能全体の kill switch
  NEXT_PUBLIC_INSPIRE_ENABLED: process.env.NEXT_PUBLIC_INSPIRE_ENABLED,
  // ホームカルーセル個別フラグ（ADR-013）。'true' のときだけホームに露出する
  NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED:
    process.env.NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED,
  // プレビュー生成で運営側のテストキャラ画像 URL（private bucket、サーバー専用）
  INSPIRE_TEST_CHARACTER_IMAGE_URL:
    process.env.INSPIRE_TEST_CHARACTER_IMAGE_URL,
  // 申請者ホワイトリスト（カンマ区切り UUID、空 = 全許可、ADR-010 fail-open）
  INSPIRE_SUBMISSION_ALLOWED_USER_IDS:
    process.env.INSPIRE_SUBMISSION_ALLOWED_USER_IDS,

  // Catalog (絵師カタログ機能)
  // Cloudflare Turnstile (ゲスト投稿の bot 対策)
  NEXT_PUBLIC_TURNSTILE_SITE_KEY:
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  // 機能全体の kill switch (未設定 or "true" で有効)
  NEXT_PUBLIC_CATALOG_ENABLED: process.env.NEXT_PUBLIC_CATALOG_ENABLED,

  // Creator Looks (= ユーザー投稿 + 隠し meta-prompt 機能)
  // サーバ専用 kill switch。NEXT_PUBLIC_ プレフィックスを意図的に付けない (= クライアントバンドルに展開させない)
  // Stage 1 では false (= admin role のみアクセス可)、Stage 3 で true (= 全公開)
  CREATOR_LOOKS_ENABLED: process.env.CREATOR_LOOKS_ENABLED,
  // pg_net → Next.js internal API の Bearer 認証用。
  // Supabase Vault `creator_looks_extract_secret` と Edge Function Secrets `EDGE_FUNCTION_SECRET` と同じ値にする。
  EDGE_FUNCTION_SECRET: process.env.EDGE_FUNCTION_SECRET,
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
    GEMINI_API_KEY: envSchema.GEMINI_API_KEY || "",
    SUPABASE_SERVICE_ROLE_KEY:
      envSchema.SUPABASE_SERVICE_ROLE_KEY || "",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      envSchema.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    STRIPE_SECRET_KEY: envSchema.STRIPE_SECRET_KEY || "",
    STRIPE_SECRET_KEY_TEST: envSchema.STRIPE_SECRET_KEY_TEST || "",
    STRIPE_SECRET_KEY_LIVE: envSchema.STRIPE_SECRET_KEY_LIVE || "",
    STRIPE_WEBHOOK_SECRET: envSchema.STRIPE_WEBHOOK_SECRET || "",
    STRIPE_WEBHOOK_SECRET_TEST:
      envSchema.STRIPE_WEBHOOK_SECRET_TEST || "",
    STRIPE_WEBHOOK_SECRET_LIVE:
      envSchema.STRIPE_WEBHOOK_SECRET_LIVE || "",
    STRIPE_PRICING_TABLE_ID:
      envSchema.STRIPE_PRICING_TABLE_ID || "",
    NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID:
      envSchema.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID || "",
    NEXT_PUBLIC_SITE_URL:
      envSchema.NEXT_PUBLIC_SITE_URL || "",
    NEXT_PUBLIC_EVENT_USER_ID:
      envSchema.NEXT_PUBLIC_EVENT_USER_ID || "",
    NEXT_PUBLIC_GA4_MEASUREMENT_ID:
      envSchema.NEXT_PUBLIC_GA4_MEASUREMENT_ID || "",
    GA4_PROPERTY_ID: envSchema.GA4_PROPERTY_ID || "",
    GA4_SERVICE_ACCOUNT_JSON_BASE64:
      envSchema.GA4_SERVICE_ACCOUNT_JSON_BASE64 || "",
    GA4_BIGQUERY_PROJECT_ID: envSchema.GA4_BIGQUERY_PROJECT_ID || "",
    GA4_BIGQUERY_DATASET: envSchema.GA4_BIGQUERY_DATASET || "",
    GA4_BIGQUERY_LOCATION: envSchema.GA4_BIGQUERY_LOCATION || "",
    ADMIN_USER_IDS: envSchema.ADMIN_USER_IDS || "",
    ADMIN_PREVIEW_USER_IDS: envSchema.ADMIN_PREVIEW_USER_IDS || "",
    ACCOUNT_PURGE_CRON_SECRET:
      envSchema.ACCOUNT_PURGE_CRON_SECRET || "",
    ACCOUNT_FORFEITURE_HASH_SALT:
      envSchema.ACCOUNT_FORFEITURE_HASH_SALT || "",
    STYLE_RATE_LIMIT_HASH_SALT:
      envSchema.STYLE_RATE_LIMIT_HASH_SALT || "",
    CRON_SECRET: envSchema.CRON_SECRET || "",
    RESEND_API_KEY: envSchema.RESEND_API_KEY || "",
    CONTACT_EMAIL: envSchema.CONTACT_EMAIL || "yuh.products@gmail.com",
    RESEND_FROM_EMAIL: envSchema.RESEND_FROM_EMAIL || "",
    NEXT_PUBLIC_INSPIRE_ENABLED: envSchema.NEXT_PUBLIC_INSPIRE_ENABLED || "",
    NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED:
      envSchema.NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED || "",
    INSPIRE_TEST_CHARACTER_IMAGE_URL:
      envSchema.INSPIRE_TEST_CHARACTER_IMAGE_URL || "",
    INSPIRE_SUBMISSION_ALLOWED_USER_IDS:
      envSchema.INSPIRE_SUBMISSION_ALLOWED_USER_IDS || "",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY:
      envSchema.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
    TURNSTILE_SECRET_KEY: envSchema.TURNSTILE_SECRET_KEY || "",
    NEXT_PUBLIC_CATALOG_ENABLED: envSchema.NEXT_PUBLIC_CATALOG_ENABLED || "",
    CREATOR_LOOKS_ENABLED: envSchema.CREATOR_LOOKS_ENABLED || "",
    EDGE_FUNCTION_SECRET: envSchema.EDGE_FUNCTION_SECRET || "",
  };
}

/**
 * 絵師カタログ機能が有効化されているか。
 * NEXT_PUBLIC_CATALOG_ENABLED が未設定 or "true" の場合に有効 (デフォルト有効)。
 */
export function isCatalogFeatureEnabled(): boolean {
  const value = env.NEXT_PUBLIC_CATALOG_ENABLED.trim().toLowerCase();
  return value === "" || value === "true" || value === "1";
}

/**
 * Creator Looks 機能の env 由来 kill switch。
 *
 * - サーバ専用 (= NEXT_PUBLIC_ プレフィックスを意図的に付けない、クライアントバンドルに展開させない)
 * - Stage 1 では false (= 一般ユーザーには無効、admin role のみが Creator Looks UI / API を使える)
 * - Stage 3 で true (= 全公開)
 * - デフォルトは false (= fail-closed)
 */
export function isCreatorLooksFeatureEnabled(): boolean {
  const value = env.CREATOR_LOOKS_ENABLED.trim().toLowerCase();
  return value === "true" || value === "1";
}

export const env = getEnv();

export function getStripeWebhookSecrets(): string[] {
  return Array.from(
    new Set(
      [
        env.STRIPE_WEBHOOK_SECRET,
        env.STRIPE_WEBHOOK_SECRET_TEST,
        env.STRIPE_WEBHOOK_SECRET_LIVE,
      ].filter((value): value is string => value.trim().length > 0)
    )
  );
}

export function getStripeSecretKeyForMode(livemode: boolean): string {
  if (livemode) {
    return env.STRIPE_SECRET_KEY_LIVE || env.STRIPE_SECRET_KEY;
  }

  return env.STRIPE_SECRET_KEY_TEST || env.STRIPE_SECRET_KEY;
}

export function getStripeSecretKeyForVerification(): string {
  return (
    env.STRIPE_SECRET_KEY ||
    env.STRIPE_SECRET_KEY_TEST ||
    env.STRIPE_SECRET_KEY_LIVE
  );
}

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
  return parseCsvUserIds(env.ADMIN_USER_IDS);
}

/**
 * プレビュー権限ユーザー (= admin_only コンテンツ閲覧のみ許可) のIDリストを取得。
 * /admin/* 管理画面・requireAdmin で守られている API は許可しない (=擬似 admin)。
 * カンマ区切り、空なら空配列。
 */
export function getAdminPreviewUserIds(): string[] {
  return parseCsvUserIds(env.ADMIN_PREVIEW_USER_IDS);
}

/**
 * 「admin_only コンテンツを閲覧できるか」の判定。
 * フル admin (ADMIN_USER_IDS) と プレビュー admin (ADMIN_PREVIEW_USER_IDS) の
 * どちらかに含まれていれば true。/admin/* 管理機能はこれと別ガード。
 */
export function isAdminViewer(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return (
    getAdminUserIds().includes(userId) ||
    getAdminPreviewUserIds().includes(userId)
  );
}

function parseCsvUserIds(value: string | undefined): string[] {
  if (!value || value.trim() === "") {
    return [];
  }
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Inspire 申請者ホワイトリストを取得
 * 環境変数 INSPIRE_SUBMISSION_ALLOWED_USER_IDS（カンマ区切り UUID）を配列に変換。
 * 空配列を返す = 全認証ユーザー許可（fail-open、ADR-010）。
 */
export function getInspireSubmissionAllowedUserIds(): string[] {
  const value = env.INSPIRE_SUBMISSION_ALLOWED_USER_IDS;
  if (!value || value.trim() === "") {
    return [];
  }
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Inspire 機能全体の有効/無効を判定
 */
export function isInspireFeatureEnabled(): boolean {
  return env.NEXT_PUBLIC_INSPIRE_ENABLED === "true";
}

/**
 * Inspire ホームカルーセルの有効/無効を判定（ADR-013）
 */
export function isInspireHomeCarouselEnabled(): boolean {
  return env.NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED === "true";
}
