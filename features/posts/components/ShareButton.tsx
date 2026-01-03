"use client";

import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { sharePost } from "../lib/share";

interface ShareButtonProps {
  postId: string;
  caption?: string | null;
  imageUrl?: string | null;
  isOwner?: boolean;
}

/**
 * シェアボタンコンポーネント
 * Web Share APIを使用して投稿をシェア
 */
export function ShareButton({
  postId,
  caption,
  imageUrl,
  isOwner = false,
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

  const getExtensionFromMime = (mime: string) => {
    const map: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
    };
    return map[mime.toLowerCase()] || "png";
  };

  const handleDownload = async () => {
    if (!imageUrl) {
      toast({
        title: "エラー",
        description: "ダウンロードできる画像がありません",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error("画像の取得に失敗しました");
      }
      const blob = await response.blob();
      const ext = getExtensionFromMime(blob.type || "image/png");
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `persta-image.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      toast({
        title: "ダウンロードしました",
        description: "画像を保存しました",
      });
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "ダウンロードに失敗しました",
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
      const text = "お着替えしました♪";

      // シェアを実行
      await sharePost(url, text, imageUrl || undefined);

      toast({
        title: "シェアしました",
        description: "投稿をシェアしました",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "シェアに失敗しました";

      // ユーザーキャンセルやジェスチャー判定エラーは無視
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        errorMessage.toLowerCase().includes("user gesture") ||
        errorMessage.toLowerCase().includes("share request")
      ) {
        return;
      }

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
      {/* オーナーのみダウンロードボタン（PC/モバイル共通） */}
      {isOwner && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-2 py-1 h-auto"
        >
          <Download className="h-5 w-5 text-gray-600" />
        </Button>
      )}
      {/* シェアボタン（投稿済みの場合のみ表示） */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleShare}
        disabled={isLoading}
        className="flex items-center gap-1.5 px-2 py-1 h-auto"
      >
        <Share2 className="h-5 w-5 text-gray-600" />
      </Button>
    </div>
  );
}
