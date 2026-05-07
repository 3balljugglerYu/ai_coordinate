"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { shareOrDownloadGeneratedImage } from "@/features/generation/lib/download-image";

interface DownloadButtonProps {
  postId: string;
  imageUrl?: string | null;
}

/**
 * ダウンロードボタンコンポーネント
 * オーナーが自分の画像をダウンロードするために使用
 */
export function DownloadButton({
  postId,
  imageUrl,
}: DownloadButtonProps) {
  const t = useTranslations("posts");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    if (isLoading) return;

    if (!imageUrl) {
      toast({
        title: t("errorTitle"),
        description: t("downloadNoImage"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await shareOrDownloadGeneratedImage(
        { id: postId, url: imageUrl },
        {
          accessDenied: t("downloadUnauthorized"),
          fetchFailed: (statusText) =>
            t("downloadFetchFailed", { statusText }),
        },
        {
          // モバイルの Web Share 成功時は OS シェアシートで完結するため、
          // 画面側のトーストは出さない（既存挙動を踏襲）。
          onDownloadSuccess: () => {
            toast({
              title: t("downloadSuccessTitle"),
              description: t("downloadSuccessDescription"),
            });
          },
        },
      );
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: t("errorTitle"),
        description:
          error instanceof Error ? error.message : t("downloadFailed"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void handleClick();
      }}
      disabled={isLoading}
      className="flex items-center gap-1.5 px-2 py-1 h-auto"
      aria-label={t("downloadAriaLabel")}
    >
      <Download className="h-5 w-5 text-gray-600" />
    </Button>
  );
}
