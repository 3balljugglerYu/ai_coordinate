"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { determineFileName } from "@/lib/utils";

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
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const isMobile = () => {
    if (typeof navigator === "undefined") return false;
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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
      // 画像をfetchで取得
      const response = await fetch(imageUrl);
      
      // 認証エラーのハンドリング（401/403）
      if (response.status === 401 || response.status === 403) {
        throw new Error('画像へのアクセス権限がありません。認証が必要な可能性があります。');
      }
      
      if (!response.ok) {
        throw new Error(`画像の取得に失敗しました: ${response.statusText}`);
      }
      
      // Blobに変換（MIMEタイプを保持）
      const blob = await response.blob();
      
      // MIMEタイプの取得順序: blob.type を優先、次にContent-Typeヘッダー、最後にデフォルト
      const mimeType = blob.type || response.headers.get('content-type') || 'image/png';
      
      // ファイル名を決定（共通ロジックを使用）
      const downloadFileName = determineFileName(
        response,
        imageUrl,
        postId,
        mimeType
      );
      
      // ObjectURLを作成
      const objectUrl = URL.createObjectURL(blob);
      
      // ダウンロードリンクを作成
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // メモリリークを防ぐためにObjectURLを解放
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 100);
      
      toast({
        title: "ダウンロードしました",
        description: "画像を保存しました",
      });
    } catch (error) {
      console.error("ダウンロードエラー:", error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "画像のダウンロードに失敗しました",
        variant: "destructive",
      });
    }
  };

  const handleDownloadMobile = async () => {
    if (!imageUrl) {
      toast({
        title: "エラー",
        description: "ダウンロードできる画像がありません",
        variant: "destructive",
      });
      return;
    }

    try {
      // 画像をfetch（CORS対応）
      const res = await fetch(imageUrl, { mode: "cors" });
      
      // 認証エラーのハンドリング（401/403）
      if (res.status === 401 || res.status === 403) {
        throw new Error('画像へのアクセス権限がありません。認証が必要な可能性があります。');
      }
      
      if (!res.ok) {
        throw new Error(`画像の取得に失敗しました: ${res.statusText}`);
      }
      
      // Blobに変換
      const blob = await res.blob();
      
      // MIMEタイプの取得（handleDownloadと同じロジック）
      const mimeType = blob.type || res.headers.get('content-type') || 'image/png';
      
      // ファイル名を決定（共通ロジックを使用）
      const fileName = determineFileName(
        res,
        imageUrl,
        postId,
        mimeType
      );
      
      // Fileオブジェクトを作成
      const file = new File(
        [blob],
        fileName,
        { type: mimeType }
      );
      
      // Web Share API Level 2（files）のサポート確認
      if (
        typeof navigator !== "undefined" &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: "Persta.AI",
        });
        return;
      }
      
      // フォールバック: 通常のダウンロード
      await handleDownload();
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      // キャンセルやジェスチャー不足は無視
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        message.includes("user gesture") ||
        message.includes("share request")
      ) {
        return;
      }
      console.error("Share Sheet失敗:", error);
      // エラー時もダウンロードにフォールバック
      await handleDownload();
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        if (isMobile()) {
          handleDownloadMobile();
        } else {
          handleDownload();
        }
      }}
      disabled={isLoading}
      className="flex items-center gap-1.5 px-2 py-1 h-auto"
    >
      <Download className="h-5 w-5 text-gray-600" />
    </Button>
  );
}
