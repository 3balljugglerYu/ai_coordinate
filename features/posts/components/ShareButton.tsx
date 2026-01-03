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

  const getPostUrl = () => {
    return `${window.location.origin}/posts/${postId}`;
  };

  /**
   * URLからファイル名を抽出
   * 例: https://...supabase.co/storage/.../1766523926783-c2p76akbrgw.jpeg
   *     -> 1766523926783-c2p76akbrgw.jpeg
   */
  const extractFileNameFromUrl = (url: string): string | null => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.split('/').pop();
      return fileName && fileName.includes('.') ? fileName : null;
    } catch {
      return null;
    }
  };

  /**
   * Content-Dispositionヘッダーからファイル名を抽出
   * 例: attachment; filename="image.jpeg"
   */
  const extractFileNameFromContentDisposition = (contentDisposition: string | null): string | null => {
    if (!contentDisposition) return null;
    
    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (filenameMatch && filenameMatch[1]) {
      // クォートを除去
      return filenameMatch[1].replace(/['"]/g, '');
    }
    return null;
  };

  /**
   * MIMEタイプから拡張子を取得
   * image/jpg は非標準だが、image/jpeg として扱う
   */
  const getExtensionFromMimeType = (mimeType: string): string => {
    // image/jpg を image/jpeg に正規化
    const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    return mimeToExt[normalizedMime] || 'png';
  };

  /**
   * ファイル名を決定する共通ロジック
   * 優先順位: Content-Disposition > URL抽出 > MIMEタイプから推測
   */
  const determineFileName = (
    response: Response,
    imageUrl: string,
    imageId: string,
    mimeType: string
  ): string => {
    const fileNameFromDisposition = extractFileNameFromContentDisposition(
      response.headers.get('content-disposition')
    );
    const fileNameFromUrl = extractFileNameFromUrl(imageUrl);
    
    if (fileNameFromDisposition) {
      // Content-Dispositionヘッダーが最優先
      return fileNameFromDisposition;
    } else if (fileNameFromUrl) {
      // URLから抽出したファイル名
      return fileNameFromUrl;
    } else {
      // MIMEタイプから拡張子を推測
      const extension = getExtensionFromMimeType(mimeType);
      return `generated-${imageId}.${extension}`;
    }
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
      // requestAnimationFrameを使用して、ブラウザの描画サイクル後に確実に解放
      requestAnimationFrame(() => {
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
        }, 100);
      });
      
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

  const handleShare = async () => {
    if (isLoading) return;

    setIsLoading(true);

    try {
      // 投稿詳細ページの絶対URLを生成
      const url = getPostUrl();
      const text = "お着替えしました♪";

      // シェアを実行
      const result = await sharePost(url, text, imageUrl || undefined);

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
      const e = error as any;
      if (e?.name === "AbortError") {
        return;
      }

      // その他のエラーのみトースト表示
      toast({
        title: "エラー",
        description: e instanceof Error ? e.message : "共有に失敗しました",
        variant: "destructive",
      });
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
