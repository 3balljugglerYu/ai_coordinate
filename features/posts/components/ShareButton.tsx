"use client";

import { useState } from "react";
import { Share2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { sharePost } from "../lib/share";
import { DEFAULT_SHARE_TEXT } from "@/constants";

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
  caption,
  imageUrl,
}: ShareButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const isMobile = () => {
    if (typeof navigator === "undefined") return false;
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  };

  const getPostUrl = () => {
    return `${window.location.origin}/posts/${postId}`;
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
          title: "URLをコピーしました",
          description: "クリップボードにコピーしました",
        });
      } else {
        throw new Error("クリップボードAPIがサポートされていません");
      }
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "URLのコピーに失敗しました",
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
        text: DEFAULT_SHARE_TEXT,
        url: url,
      };

      if ("share" in navigator) {
        await (navigator as any).share(shareData);
        // Share Sheetが開かれた場合はトーストを表示しない
      } else {
        throw new Error("Web Share APIがサポートされていません");
      }
    } catch (error) {
      // ユーザーキャンセルは無視（トーストを表示しない）
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      // その他のエラーのみトースト表示
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "共有に失敗しました",
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
      const text = DEFAULT_SHARE_TEXT;

      // シェアを実行
      const result = await sharePost(url, text);

      // sharePostが「何をしたか」を返す想定
      if (result.method === "clipboard") {
        toast({
          title: "共有文をコピーしました",
          description: "SNSに貼り付けて投稿できます",
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
        title: "エラー",
        description: error instanceof Error ? error.message : "共有に失敗しました",
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
          リンクをコピー
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShareViaWebAPI}>
          <Share2 className="mr-2 h-4 w-4" />
          その他の方法で共有
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // シェアボタン（PC版: ドロップダウンメニュー、モバイル版: 直接シェア）
  return isMobile() ? mobileShareButton : desktopShareButton;
}
