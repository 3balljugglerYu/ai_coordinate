/**
 * Web Share APIを使用したシェア機能のユーティリティ関数
 */

export type ShareMethod = "share" | "clipboard";

export interface ShareResult {
  method: ShareMethod;
}

/**
 * 投稿をシェアする
 * @param url 投稿詳細ページの絶対URL
 * @param text シェアするテキスト
 * @returns シェア方法を返す（"share" または "clipboard"）
 * @throws ユーザーがキャンセルした場合（AbortError）や、クリップボードAPIも失敗した場合
 */
export async function sharePost(
  url: string,
  text: string
): Promise<ShareResult> {
  const shareData: ShareData = {
    title: "Persta.AI",
    text,
    url,
  };

  // 1) Share Sheet（URL+textを優先。OGPが主軸なので、まずはリンク共有）
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

  // 2) フォールバック: クリップボードに text + "\n" + url をコピー
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      const clipboardText = `${text}\n${url}`;
      await navigator.clipboard.writeText(clipboardText);
      return { method: "clipboard" };
    } catch {
      // クリップボードAPIも失敗した場合はエラーをスロー
      throw new Error("Web Share API and Clipboard API are not supported.");
    }
  } else {
    throw new Error("Web Share API and Clipboard API are not supported.");
  }
}
