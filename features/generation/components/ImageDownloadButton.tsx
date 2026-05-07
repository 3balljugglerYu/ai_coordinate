"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  shareOrDownloadGeneratedImage,
  type DownloadCallbacks,
} from "@/features/generation/lib/download-image";

export interface ImageDownloadButtonMessages {
  accessDenied: string;
  fetchFailed: (statusText: string) => string;
  /**
   * 失敗時の destructive toast の title。指定があれば description に詳細メッセージを入れ、
   * 指定が無ければ詳細メッセージそのものを title に表示する（呼び出し側既存挙動の差を吸収）。
   */
  errorTitle?: string;
  /** error が `Error` 由来でないときに表示する fallback テキスト */
  failedFallback: string;
  successTitle: string;
  successDescription: string;
  /**
   * `imageUrl` が null/undefined のままクリックされた場合の destructive toast 説明文。
   * 未指定なら何もしない。
   */
  noImage?: string;
}

export interface ImageDownloadButtonProps {
  imageUrl: string | null | undefined;
  /** ファイル名生成に使う ID（postId / styleId / 生成画像 ID 等） */
  id: string;
  /**
   * - `ghost`: 投稿詳細のように他のアイコンに溶け込ませる用途。アイコンのみ表示。
   * - `outline`: 結果パネルなど主要アクション用途。`label` を併用してラベル付きで表示。
   */
  variant: "ghost" | "outline";
  /** outline 時のラベル文言。ghost では未表示。 */
  label?: string;
  ariaLabel: string;
  messages: ImageDownloadButtonMessages;
  /** 成功時の追加処理（usage tracking 等）。トースト表示は本コンポーネントが担う。 */
  callbacks?: DownloadCallbacks;
}

/**
 * 画像ダウンロード用の共通ボタン。
 *
 * モバイル/PC 分岐は `shareOrDownloadGeneratedImage()` に委譲する。投稿詳細・
 * `/style` 即時結果・`/coordinate` ゲストプレビューなど、複数画面の DL 動線を
 * このコンポーネント1つに統合する。
 */
export function ImageDownloadButton({
  imageUrl,
  id,
  variant,
  label,
  ariaLabel,
  messages,
  callbacks,
}: ImageDownloadButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    if (isLoading) return;

    if (!imageUrl) {
      if (messages.noImage) {
        toast({
          title: messages.errorTitle ?? messages.noImage,
          description: messages.errorTitle ? messages.noImage : undefined,
          variant: "destructive",
        });
      }
      return;
    }

    setIsLoading(true);
    try {
      await shareOrDownloadGeneratedImage(
        { id, url: imageUrl },
        {
          accessDenied: messages.accessDenied,
          fetchFailed: messages.fetchFailed,
        },
        {
          // モバイル Web Share 成功時は OS シェアシートで完結するため、
          // 画面側のトーストは出さない（callbacks のみ実行）
          onShareSuccess: () => {
            callbacks?.onShareSuccess?.();
          },
          onDownloadSuccess: () => {
            toast({
              title: messages.successTitle,
              description: messages.successDescription,
            });
            callbacks?.onDownloadSuccess?.();
          },
        },
      );
    } catch (error) {
      console.error("ImageDownloadButton error:", error);
      const detail =
        error instanceof Error ? error.message : messages.failedFallback;
      toast({
        title: messages.errorTitle ?? detail,
        description: messages.errorTitle ? detail : undefined,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (variant === "ghost") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          void handleClick();
        }}
        disabled={isLoading}
        className="flex items-center gap-1.5 px-2 py-1 h-auto"
        aria-label={ariaLabel}
      >
        <Download className="h-5 w-5 text-gray-600" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void handleClick();
      }}
      disabled={isLoading}
      className="flex h-9 items-center gap-2 rounded-full border-slate-300 px-3 text-sm font-medium text-slate-700 shadow-sm"
      aria-label={ariaLabel}
    >
      <Download className="h-4 w-4" />
      {label ? <span>{label}</span> : null}
    </Button>
  );
}
