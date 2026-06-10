"use client";

import { useState } from "react";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { useToast } from "@/components/ui/use-toast";
import { shareOrDownloadGeneratedImage } from "@/features/generation/lib/download-image";
import { MOUNT_SHARE_MESSAGES } from "../lib/mount-share-messages";
import { buildPublicMountUrl, trackMountShareEvent } from "../lib/share-mount";

/**
 * 公開台紙ページで「所有者のみ」に表示するシェア/保存ボタン。
 * シェアは posts と同じ汎用 ShareLinkButton(モバイル=シェアシート、
 * PC=コピー/Web Share メニュー)で、成功時に share-event を計測する。
 * 保存は style 画面の生成一覧と同じ共通ヘルパに委譲する
 * (モバイル=Web Share のシェアシート、PC=ブラウザDL)。
 */
export function MountShareButton({
  completionId,
  mountImageUrl,
}: {
  completionId: string;
  mountImageUrl: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  async function handleDownload() {
    setDownloading(true);
    try {
      // リストタブの ja.ts と同じ文言を直書き(i18n は Phase 7)。
      await shareOrDownloadGeneratedImage(
        { id: completionId, url: mountImageUrl },
        {
          accessDenied:
            "画像へのアクセス権限がありません。認証が必要な可能性があります。",
          fetchFailed: (statusText) =>
            `画像の取得に失敗しました: ${statusText}`,
        },
      );
    } catch (error) {
      console.error("ダウンロードエラー:", error);
      toast({
        title:
          error instanceof Error
            ? error.message
            : "画像のダウンロードに失敗しました",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-wrap justify-center gap-3">
      <ShareLinkButton
        url={() => buildPublicMountUrl(completionId, mountImageUrl)}
        messages={MOUNT_SHARE_MESSAGES}
        onShared={() => trackMountShareEvent(completionId)}
        className="px-5"
      >
        台紙をシェアする
      </ShareLinkButton>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        画像を保存
      </button>
    </div>
  );
}
