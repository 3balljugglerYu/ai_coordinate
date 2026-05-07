"use client";

import { useTranslations } from "next-intl";
import { ImageDownloadButton } from "@/features/generation/components/ImageDownloadButton";

interface DownloadButtonProps {
  postId: string;
  /** 表示用 URL（WebP の可能性あり）。`originalImageUrl` が無いときの fallback */
  imageUrl?: string | null;
  /**
   * ダウンロード用の元画像 URL（PNG/JPEG）。
   * `getPostOriginalUrl(post)` で取得した値を渡す想定。
   * 指定があれば DL 時はこちらを優先し、ユーザーには元画像（高画質）を保存させる。
   */
  originalImageUrl?: string | null;
}

/**
 * 投稿詳細用ダウンロードボタン。共通の `<ImageDownloadButton variant="ghost">`
 * に i18n 文言を流し込むだけの薄いラッパー。
 *
 * 表示用は WebP（軽量）、ダウンロード用は元の PNG/JPEG という二段構成にするため、
 * `originalImageUrl` を優先し、未指定なら `imageUrl` に fallback する。
 */
export function DownloadButton({
  postId,
  imageUrl,
  originalImageUrl,
}: DownloadButtonProps) {
  const t = useTranslations("posts");

  return (
    <ImageDownloadButton
      imageUrl={originalImageUrl ?? imageUrl}
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
