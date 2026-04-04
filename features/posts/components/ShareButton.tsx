"use client";

import { useState } from "react";
import { Share2, Copy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { sharePost } from "@/lib/share-post";
import { getPostDetailUrl } from "@/lib/url-utils";

interface ShareButtonProps {
  postId: string;
  caption?: string | null;
  imageUrl?: string | null;
}

/**
 * シェアボタンコンポーネント
 * Web Share APIを使用して投稿をシェア
 */
export function ShareButton({
  postId,
}: ShareButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const t = useTranslations("posts");
  const locale = useLocale();

  const isMobile = () => {
    if (typeof navigator === "undefined") return false;
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  };

  const getPostUrl = () => {
    return getPostDetailUrl(postId, locale as import("@/i18n/config").Locale);
  };

  // URLのみをコピーする関数
  const handleCopyLink = async () => {
    if (isLoading) return;

    setIsLoading(true);

    try {
      const url = getPostUrl();
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast({
          title: t("shareCopyTitle"),
          description: t("shareCopyDescription"),
        });
      } else {
        throw new Error(t("shareClipboardUnsupported"));
      }
    } catch (error) {
      toast({
        title: t("errorTitle"),
        description:
          error instanceof Error ? error.message : t("shareFailed"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Web Share APIを直接呼び出す関数（「その他の方法で共有」用）
  const handleShareViaWebAPI = async () => {
    if (isLoading) return;

    setIsLoading(true);

    try {
      const url = getPostUrl();
      const shareData: ShareData = {
        title: "Persta.AI",
        text: t("shareDefaultText"),
        url: url,
      };

      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
        // Share Sheetが開かれた場合はトーストを表示しない
      } else {
        throw new Error(t("shareWebApiUnsupported"));
      }
    } catch (error) {
      // ユーザーキャンセルは無視（トーストを表示しない）
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      // その他のエラーのみトースト表示
      toast({
        title: t("errorTitle"),
        description:
          error instanceof Error ? error.message : t("shareFailed"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // モバイル版用のシェア関数（従来通り）
  const handleShare = async () => {
    if (isLoading) return;

    setIsLoading(true);

    try {
      // 投稿詳細ページの絶対URLを生成
      const url = getPostUrl();
      const text = t("shareDefaultText");

      // シェアを実行
      const result = await sharePost(url, text);

      // sharePostが「何をしたか」を返す想定
      if (result.method === "clipboard") {
        toast({
          title: t("shareCopiedTitle"),
          description: t("shareCopiedDescription"),
        });
      }
      // result.method === "share" の場合はトーストを表示しない（共有画面が開かれるため）
    } catch (error) {
      // ユーザーキャンセルは無視（トーストを表示しない）
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      // その他のエラーのみトースト表示
      toast({
        title: t("errorTitle"),
        description:
          error instanceof Error ? error.message : t("shareFailed"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // モバイル版のシェアボタン（従来通り）
  const mobileShareButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleShare}
      disabled={isLoading}
      className="flex items-center gap-1.5 px-2 py-1 h-auto"
    >
      <Share2 className="h-5 w-5 text-gray-600" />
    </Button>
  );

  // PC版のシェアボタン（ドロップダウンメニュー付き）
  const desktopShareButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isLoading}
          className="flex items-center gap-1.5 px-2 py-1 h-auto"
        >
          <Share2 className="h-5 w-5 text-gray-600" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={handleCopyLink}>
          <Copy className="mr-2 h-4 w-4" />
          {t("shareCopyLink")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShareViaWebAPI}>
          <Share2 className="mr-2 h-4 w-4" />
          {t("shareMoreOptions")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // シェアボタン（PC版: ドロップダウンメニュー、モバイル版: 直接シェア）
  return isMobile() ? mobileShareButton : desktopShareButton;
}
