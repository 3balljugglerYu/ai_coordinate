"use client";

import { useEffect, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { copyTextToClipboard } from "@/lib/clipboard";
import { sharePost } from "@/lib/share-post";
import type { ComponentProps, ReactNode } from "react";

export type ShareLinkMethod = "share" | "clipboard";

export interface ShareLinkMessages {
  /** PC メニュー: リンクをコピー */
  copyLink: string;
  /** PC メニュー: その他の方法で共有 */
  moreOptions: string;
  /** コピー成功トーストの title */
  copiedTitle: string;
  /** 失敗トーストの title */
  errorTitle: string;
  /** 失敗時の汎用 description(詳細メッセージが取れない場合) */
  failed: string;
  /** navigator.share 非対応時の description */
  webApiUnsupported: string;
}

export interface ShareLinkButtonProps {
  /** シェアする絶対URL。クリック時点で評価したい場合は関数を渡す */
  url: string | (() => string);
  /** 表示文言。i18n 配線済み画面は t() を、未配線画面(/m 等)は直書きを渡す */
  messages: ShareLinkMessages;
  /** 共有/コピーが実際に行われた後に呼ばれる(キャンセル時は呼ばれない) */
  onShared?: (method: ShareLinkMethod) => void;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
  ariaLabel?: string;
  /** トリガーボタンの中身(アイコン/ラベル) */
  children: ReactNode;
}

/**
 * URL 共有ボタンの汎用コンポーネント(posts の ShareButton から抽出)。
 *
 * - モバイル(UA判定): クリックで sharePost — Web Share のシェアシートを開き、
 *   非対応環境ではクリップボードコピーにフォールバックして copied トーストを出す。
 * - PC: ドロップダウンで「リンクをコピー」「その他の方法で共有(navigator.share)」。
 * - ユーザーキャンセル(AbortError)は無音。失敗は destructive トースト。
 */
export function ShareLinkButton({
  url,
  messages,
  onShared,
  variant,
  size,
  className,
  ariaLabel,
  children,
}: ShareLinkButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  // SSR とハイドレーション初回は必ず PC 分岐を描画し、マウント後に UA 判定で
  // モバイル分岐へ切り替える(レンダー中に navigator を参照すると SSR との
  // 構造差で hydration mismatch になる)。両分岐ともトリガーの見た目は
  // 同一なので、切替によるちらつきはない。
  const [isMobile, setIsMobile] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMobile(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    }
  }, []);

  const resolveUrl = () => (typeof url === "function" ? url() : url);

  const showError = (description: string) => {
    toast({
      title: messages.errorTitle,
      description,
      variant: "destructive",
    });
  };

  // モバイル: シェアシート優先(非対応はクリップボードフォールバック)
  const handleMobileShare = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const result = await sharePost(resolveUrl());
      if (result.method === "clipboard") {
        toast({ title: messages.copiedTitle });
      }
      // method === "share" はシェアシートで完結するためトーストなし
      onShared?.(result.method);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      showError(error instanceof Error ? error.message : messages.failed);
    } finally {
      setIsLoading(false);
    }
  };

  // PC メニュー: URL のみをコピー
  const handleCopyLink = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await copyTextToClipboard(resolveUrl());
      toast({ title: messages.copiedTitle });
      onShared?.("clipboard");
    } catch {
      showError(messages.failed);
    } finally {
      setIsLoading(false);
    }
  };

  // PC メニュー: Web Share API を直接呼ぶ(「その他の方法で共有」)
  const handleShareViaWebApi = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      if (typeof navigator.share !== "function") {
        throw new Error(messages.webApiUnsupported);
      }
      // OGP 表示を優先するため URL のみをシェアする(text を含めると
      // OGP カードが出ない場合がある — sharePost と同じ方針)
      await navigator.share({ title: "Persta.AI", url: resolveUrl() });
      onShared?.("share");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      showError(error instanceof Error ? error.message : messages.failed);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerButton = (onClick?: () => void) => (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      aria-label={ariaLabel}
      disabled={isLoading}
      onClick={onClick}
    >
      {children}
    </Button>
  );

  if (isMobile) {
    return triggerButton(() => {
      void handleMobileShare();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{triggerButton()}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={() => {
            void handleCopyLink();
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          {messages.copyLink}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void handleShareViaWebApi();
          }}
        >
          <Share2 className="mr-2 h-4 w-4" />
          {messages.moreOptions}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
