"use client";

import { Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { getPostDetailUrl } from "@/lib/url-utils";

interface ShareButtonProps {
  postId: string;
  caption?: string | null;
  imageUrl?: string | null;
}

/**
 * 投稿シェアボタン。共有 UI の実体は汎用 ShareLinkButton
 * (モバイル=シェアシート、PC=コピー/Web Share メニュー)。
 */
export function ShareButton({ postId }: ShareButtonProps) {
  const t = useTranslations("posts");
  const locale = useLocale() as Locale;

  return (
    <ShareLinkButton
      url={() => getPostDetailUrl(postId, locale)}
      variant="ghost"
      size="sm"
      className="flex items-center gap-1.5 px-2 py-1 h-auto"
      messages={{
        copyLink: t("shareCopyLink"),
        moreOptions: t("shareMoreOptions"),
        copiedTitle: t("shareCopyTitle"),
        errorTitle: t("errorTitle"),
        failed: t("shareFailed"),
        webApiUnsupported: t("shareWebApiUnsupported"),
      }}
    >
      <Share2 className="h-5 w-5 text-gray-600" />
    </ShareLinkButton>
  );
}
