/**
 * アプリケーション定数
 */

export const APP_NAME = "Persta.AI";

export const ROUTES = {
  HOME: "/",
  DASHBOARD: "/dashboard",
  LOGIN: "/login",
  SIGNUP: "/signup",
  MY_PAGE: "/my-page",
  MY_PAGE_ACCOUNT: "/my-page/account",
  MY_PAGE_CONTACT: "/my-page/contact",
  MY_PAGE_CREDITS: "/my-page/credits",
  MY_PAGE_CREDITS_PURCHASE: "/my-page/credits/purchase",
  COORDINATE: "/coordinate",
} as const;

export const API_ENDPOINTS = {
  GENERATE: "/api/generate",
  GENERATION_STATUS: "/api/generation-status",
} as const;

// コメントの最大文字数
export const COMMENT_MAX_LENGTH = 200;

// シェア用のデフォルトテキスト
export const DEFAULT_SHARE_TEXT = "#PerstaAI で、イメージ通りに作れました！";

// OGP用のタイトルタグライン
export const DEFAULT_TITLE_TAGLINE = "着てみたいも、なりたいも。";

// OGP用のシェア説明文
export const DEFAULT_SHARE_DESCRIPTION = "#PerstaAI で、イメージ通りに作れました！";

// 紹介特典の金額（ペルコイン）
// 注意: この値はデータベース関数（grant_referral_bonus）でも使用されています
// 金額を変更する場合は、データベース関数も同時に更新してください
export const REFERRAL_BONUS_AMOUNT = 100;

// デイリー投稿特典の金額（ペルコイン）
// 注意: この値はデータベース関数（grant_daily_post_bonus）でも使用されています
// 金額を変更する場合は、データベース関数も同時に更新してください
export const DAILY_POST_BONUS_AMOUNT = 30;

// ストリーク（連続ログイン）特典のスケジュール（2週間ループ）
// 注意: この値はデータベース関数（grant_streak_bonus）でも使用されています
// 金額を変更する場合は、データベース関数も同時に更新してください
// 配列のインデックスは連続ログイン日数（1-14）に対応
export const STREAK_BONUS_SCHEDULE = [
  10, // 1日目
  10, // 2日目
  20, // 3日目
  10, // 4日目
  10, // 5日目
  10, // 6日目
  50, // 7日目
  10, // 8日目
  10, // 9日目
  10, // 10日目
  10, // 11日目
  10, // 12日目
  10, // 13日目
  100, // 14日目
] as const;
