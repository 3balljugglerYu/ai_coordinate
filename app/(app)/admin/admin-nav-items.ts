export type AdminNavIconKey =
  | "dashboard"
  | "search"
  | "shield-check"
  | "coins"
  | "settings"
  | "minus-circle"
  | "wallet"
  | "rectangle-horizontal"
  | "image"
  | "file-text"
  | "flag";

export interface AdminNavItem {
  path: string;
  label: string;
  description: string;
  iconKey: AdminNavIconKey;
  quickAction?: boolean;
}

export const adminNavItems: AdminNavItem[] = [
  {
    path: "/admin",
    label: "ダッシュボード",
    description: "運営状況と主要KPIを確認",
    iconKey: "dashboard",
  },
  {
    path: "/admin/users",
    label: "ユーザー検索",
    description: "ユーザー情報を検索して確認",
    iconKey: "search",
    quickAction: true,
  },
  {
    path: "/admin/moderation",
    label: "投稿審査",
    description: "審査待ちの投稿を確認",
    iconKey: "shield-check",
    quickAction: true,
  },
  {
    path: "/admin/bonus",
    label: "ボーナス付与",
    description: "ペルコインを手動で付与",
    iconKey: "coins",
    quickAction: true,
  },
  {
    path: "/admin/percoin-defaults",
    label: "デフォルト枚数",
    description: "ボーナス既定値を設定",
    iconKey: "settings",
  },
  {
    path: "/admin/deduction",
    label: "ペルコイン減算",
    description: "運営による減算を実行",
    iconKey: "minus-circle",
  },
  {
    path: "/admin/credits-summary",
    label: "ペルコイン集計",
    description: "残高・購入・消費の全体集計",
    iconKey: "wallet",
    quickAction: true,
  },
  {
    path: "/admin/banners",
    label: "バナー管理",
    description: "ホームバナーの掲載管理",
    iconKey: "rectangle-horizontal",
  },
  {
    path: "/admin/materials-images/free-materials",
    label: "フリー素材管理",
    description: "配布素材の画像を管理",
    iconKey: "image",
  },
  {
    path: "/admin/image-optimization",
    label: "画像最適化",
    description: "WebP変換状況を確認",
    iconKey: "image",
    quickAction: true,
  },
  {
    path: "/admin/audit-log",
    label: "操作ログ",
    description: "管理操作の履歴を確認",
    iconKey: "file-text",
  },
  {
    path: "/admin/reports",
    label: "通報一覧",
    description: "投稿への通報状況を確認",
    iconKey: "flag",
    quickAction: true,
  },
];

export const adminQuickActionItems = adminNavItems.filter(
  (item) => item.quickAction
);
