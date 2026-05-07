"use client";

import { useTranslations } from "next-intl";
import { ImageDownloadButton } from "@/features/generation/components/ImageDownloadButton";

interface DownloadButtonProps {
  postId: string;
  imageUrl?: string | null;
}

/**
 * 投稿詳細用ダウンロードボタン。共通の `<ImageDownloadButton variant="ghost">`
 * に i18n 文言を流し込むだけの薄いラッパー。
 */
export function DownloadButton({ postId, imageUrl }: DownloadButtonProps) {
  const t = useTranslations("posts");

  return (
    <ImageDownloadButton
      imageUrl={imageUrl}
      id={postId}
      variant="ghost"
      ariaLabel={t("downloadAriaLabel")}
      messages={{
        accessDenied: t("downloadUnauthorized"),
        fetchFailed: (statusText) =>
          t("downloadFetchFailed", { statusText }),
        errorTitle: t("errorTitle"),
        failedFallback: t("downloadFailed"),
        successTitle: t("downloadSuccessTitle"),
        successDescription: t("downloadSuccessDescription"),
        noImage: t("downloadNoImage"),
      }}
    />
  );
}
