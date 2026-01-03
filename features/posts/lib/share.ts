/**
 * Web Share APIを使用したシェア機能のユーティリティ関数
 */

import { DEFAULT_SHARE_TEXT } from "@/constants";

export type ShareMethod = "share" | "clipboard";

export interface ShareResult {
  method: ShareMethod;
}

/**
 * 投稿をシェアする
 * @param url 投稿詳細ページの絶対URL
 * @param text シェアするテキスト（キャプションなど）
 * @returns シェア方法を返す（"share" または "clipboard"）
 * @throws ユーザーがキャンセルした場合（AbortError）や、クリップボードAPIも失敗した場合
 */
export async function sharePost(
  url: string,
  text?: string
): Promise<ShareResult> {
  const shareText = text || DEFAULT_SHARE_TEXT;
  const shareData: ShareData = {
    title: "Persta.AI",
    text: shareText,
    url: url,
  };

  // 1) Share Sheet（URL+textを優先。OGPが主軸なので、まずはリンク共有）
  if ("share" in navigator) {
    try {
      await (navigator as any).share(shareData);
      return { method: "share" };
    } catch (e: any) {
      // ユーザーキャンセルは呼び出し側で処理
      if (e?.name === "AbortError") {
        throw e;
      }
      // その他のエラーはフォールバックへ続行
    }
  }

  // 2) フォールバック: クリップボードに text + "\n" + url をコピー
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      const clipboardText = `${shareText}\n${url}`;
      await navigator.clipboard.writeText(clipboardText);
      return { method: "clipboard" };
    } catch (error) {
      // クリップボードAPIも失敗した場合はエラーをスロー
      throw new Error("Web Share API and Clipboard API are not supported.");
    }
  } else {
    throw new Error("Web Share API and Clipboard API are not supported.");
  }
}

