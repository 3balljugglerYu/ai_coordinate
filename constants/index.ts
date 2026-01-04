/**
 * アプリケーション定数
 */

export const APP_NAME = "Persta.AI";

export const ROUTES = {
  HOME: "/",
  DASHBOARD: "/dashboard",
  LOGIN: "/login",
  SIGNUP: "/signup",
} as const;

export const API_ENDPOINTS = {
  GENERATE: "/api/generate",
  GENERATION_STATUS: "/api/generation-status",
} as const;

// コメントの最大文字数
export const COMMENT_MAX_LENGTH = 200;

// シェア用のデフォルトテキスト
export const DEFAULT_SHARE_TEXT = "お着替えしました♪";

// OGP用のタイトルタグライン
export const DEFAULT_TITLE_TAGLINE = "着てみたいを、今すぐ。";

// OGP用のシェア説明文
export const DEFAULT_SHARE_DESCRIPTION = "#PerstaAI で、お着替えしてみました♪";

