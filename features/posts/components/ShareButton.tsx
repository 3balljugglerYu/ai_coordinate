"use client";

import { useState } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { sharePost } from "../lib/share";

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
  const [isUrlCopied, setIsUrlCopied] = useState(false);
  const { toast } = useToast();

  const getPostUrl = () => {
    return `${window.location.origin}/posts/${postId}`;
  };

  const handleCopyUrl = async () => {
    try {
      const url = getPostUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        setIsUrlCopied(true);
        toast({
          title: "URLをコピーしました",
          description: "投稿のURLをクリップボードにコピーしました",
        });
        setTimeout(() => setIsUrlCopied(false), 2000);
      } else {
        // フォールバック: 古いブラウザ向け
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setIsUrlCopied(true);
        toast({
          title: "URLをコピーしました",
          description: "投稿のURLをクリップボードにコピーしました",
        });
        setTimeout(() => setIsUrlCopied(false), 2000);
      }
    } catch (error) {
      toast({
        title: "エラー",
        description: "URLのコピーに失敗しました",
        variant: "destructive",
      });
    }
  };

  const handleShare = async () => {
    if (isLoading) return;

    setIsLoading(true);

    try {
      // 投稿詳細ページの絶対URLを生成
      const url = getPostUrl();

      // シェアを実行
      await sharePost(url, caption || undefined, imageUrl || undefined);

      toast({
        title: "シェアしました",
        description: "投稿をシェアしました",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "シェアに失敗しました";

      // Web Share APIがサポートされていない場合のフォールバック
      if (errorMessage.includes("copied to clipboard")) {
        toast({
          title: "URLをコピーしました",
          description: "シェア機能はモバイルブラウザでのみ利用可能です",
        });
      } else {
        toast({
          title: "エラー",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleShare}
        disabled={isLoading}
        className="flex items-center gap-1.5 px-2 py-1 h-auto"
      >
        <Share2 className="h-5 w-5 text-gray-600" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopyUrl}
        disabled={isUrlCopied}
        className="flex items-center gap-1.5 px-2 py-1 h-auto"
      >
        {isUrlCopied ? (
          <Check className="h-5 w-5 text-green-600" />
        ) : (
          <Copy className="h-5 w-5 text-gray-600" />
        )}
      </Button>
    </div>
  );
}

