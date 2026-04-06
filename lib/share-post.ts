/**
 * Web Share APIを使用したシェア機能のユーティリティ関数
 */

import { copyTextToClipboard } from "@/lib/clipboard";

export type ShareMethod = "share" | "clipboard";

export interface ShareResult {
  method: ShareMethod;
}

/**
 * 投稿をシェアする
 * OGP表示を優先するため、URLのみをシェアする（textを含めるとOGPカードが表示されない場合がある）
 * @param url 投稿詳細ページの絶対URL
 * @returns シェア方法を返す（"share" または "clipboard"）
 * @throws ユーザーがキャンセルした場合（AbortError）や、クリップボードAPIも失敗した場合
 */
export async function sharePost(
  url: string,
): Promise<ShareResult> {
  const shareData: ShareData = {
    title: "Persta.AI",
    url,
  };

  // 1) Share Sheet（OGPが主軸なので、URLのみをシェア）
  if (typeof navigator.share === "function") {
    try {
      await navigator.share(shareData);
      return { method: "share" };
    } catch (error: unknown) {
      // ユーザーキャンセルは呼び出し側で処理
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      // その他のエラーはフォールバックへ続行
    }
  }

  // 2) フォールバック: クリップボードにURLのみをコピー（HTTP環境にも対応）
  await copyTextToClipboard(url);
  return { method: "clipboard" };
}
