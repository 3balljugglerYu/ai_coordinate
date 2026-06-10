import type { ShareLinkMessages } from "@/components/ShareLinkButton";

/**
 * 台紙シェア(ShareLinkButton)用の日本語文言。
 * /m 公開ページ・コンプリート演出モーダルは i18n 未配線(Phase 7 予定)のため、
 * posts の ja.ts と同じ文言をここに一本化して直書きする。
 */
export const MOUNT_SHARE_MESSAGES: ShareLinkMessages = {
  copyLink: "リンクをコピー",
  moreOptions: "その他の方法で共有",
  copiedTitle: "URLをコピーしました",
  errorTitle: "エラー",
  failed: "共有に失敗しました",
  webApiUnsupported: "Web Share APIがサポートされていません",
};
