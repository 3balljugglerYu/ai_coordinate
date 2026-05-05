import { determineFileName } from "@/lib/utils";
import type { GeneratedImageData } from "../types";

/**
 * 生成画像をブラウザでダウンロードする共通ヘルパ。
 * GeneratedImageGallery（グリッド）と GeneratedImageList（リスト）から共有する。
 *
 * 失敗時は呼び出し側でハンドリングできるよう例外を投げる。
 */
export async function downloadGeneratedImage(
  image: GeneratedImageData,
  messages: {
    accessDenied: string;
    fetchFailed: (statusText: string) => string;
  },
): Promise<void> {
  const response = await fetch(image.url);

  if (response.status === 401 || response.status === 403) {
    throw new Error(messages.accessDenied);
  }

  if (!response.ok) {
    throw new Error(messages.fetchFailed(response.statusText));
  }

  const blob = await response.blob();
  const mimeType =
    blob.type || response.headers.get("content-type") || "image/png";

  const downloadFileName = determineFileName(
    response,
    image.url,
    image.id,
    mimeType,
  );

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = downloadFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  requestAnimationFrame(() => {
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 100);
  });
}
