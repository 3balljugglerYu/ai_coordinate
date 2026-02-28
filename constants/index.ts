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

