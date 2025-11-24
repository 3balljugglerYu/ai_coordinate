/**
 * Web Share APIを使用したシェア機能のユーティリティ関数
 */

/**
 * 投稿をシェアする
 * @param url 投稿詳細ページの絶対URL
 * @param text シェアするテキスト（キャプションなど）
 * @param imageUrl シェアする画像のURL（オプショナル）
 * @throws Web Share APIがサポートされていない場合、クリップボードにURLをコピーしてエラーをスロー
 */
export async function sharePost(
  url: string,
  text?: string,
  imageUrl?: string
): Promise<void> {
  // Web Share APIがサポートされているかチェック
  if (!navigator.share) {
    // フォールバック: クリップボードにURLをコピー
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        throw new Error("Web Share API is not supported. URL copied to clipboard.");
      } catch (error) {
        // クリップボードAPIも失敗した場合
        throw new Error("Web Share API and Clipboard API are not supported.");
      }
    } else {
      throw new Error("Web Share API and Clipboard API are not supported.");
    }
  }

  // まず画像を含めてシェアを試行
  if (imageUrl) {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch image");
      }
      const blob = await response.blob();
      const file = new File([blob], "image.png", { type: blob.type });
      
      // 画像のみでシェアを試行（エアドロップなどでURL/テキストと画像の同時送信ができない場合があるため）
      try {
        await navigator.share({
          files: [file],
        });
        return; // 成功したら終了
      } catch (shareError) {
        // 画像のみのシェアが失敗した場合、URL/テキストを含めて再試行
        console.warn("Image-only share failed, trying with URL and text:", shareError);
      }
    } catch (error) {
      // 画像の取得に失敗した場合は画像なしでシェア
      console.warn("Failed to fetch image for sharing:", error);
    }
  }

  // URLとテキストを含めてシェア（画像なし、または画像のみのシェアが失敗した場合）
  const shareData: ShareData = {
    title: "AI Coordinate",
    text: text || "",
    url: url,
  };

  await navigator.share(shareData);
}

