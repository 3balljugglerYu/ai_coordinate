import { determineFileName } from "@/lib/utils";

/**
 * ダウンロード対象画像の最小インターフェース。
 * `GeneratedImageData` もこの形を満たすため、生成結果系の呼び出し側は
 * 既存どおりそのまま渡せる。投稿詳細やスタイル画面のように `id` を
 * 別の意味（postId / styleId）で使う場合もこの型に束ねて渡す。
 */
export interface DownloadableImage {
  id: string;
  url: string;
}

interface DownloadMessages {
  accessDenied: string;
  fetchFailed: (statusText: string) => string;
}

/**
 * 成功パスごとに呼び出し側が任意の処理（成功トーストや usage tracking など）を
 * 差し込めるようにするコールバック。
 *
 * - `onShareSuccess`: モバイルの Web Share API でシェアシートが完了した直後。
 *   OS シェアシート側で完結するため、画面トーストは出さない呼び出し側が多い。
 * - `onDownloadSuccess`: ブラウザダウンロード（PC、または Web Share fallback）成功時。
 */
export interface DownloadCallbacks {
  onShareSuccess?: () => void;
  onDownloadSuccess?: () => void;
}

interface FetchedImagePayload {
  blob: Blob;
  mimeType: string;
  fileName: string;
}

function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function fetchImagePayload(
  image: DownloadableImage,
  messages: DownloadMessages,
  init?: RequestInit,
): Promise<FetchedImagePayload> {
  const response = await fetch(image.url, init);
  if (response.status === 401 || response.status === 403) {
    throw new Error(messages.accessDenied);
  }
  if (!response.ok) {
    throw new Error(messages.fetchFailed(response.statusText));
  }
  const blob = await response.blob();
  const mimeType =
    blob.type || response.headers.get("content-type") || "image/png";
  const fileName = determineFileName(response, image.url, image.id, mimeType);
  return { blob, mimeType, fileName };
}

function triggerBrowserDownload(payload: FetchedImagePayload): void {
  const objectUrl = URL.createObjectURL(payload.blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = payload.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  requestAnimationFrame(() => {
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 100);
  });
}

/**
 * 生成画像をブラウザでダウンロードする共通ヘルパ。
 * 失敗時は呼び出し側でハンドリングできるよう例外を投げる。
 */
export async function downloadGeneratedImage(
  image: DownloadableImage,
  messages: DownloadMessages,
  callbacks?: DownloadCallbacks,
): Promise<void> {
  const payload = await fetchImagePayload(image, messages);
  triggerBrowserDownload(payload);
  callbacks?.onDownloadSuccess?.();
}

/**
 * 生成画像を保存する共通ヘルパ（モバイルでは Web Share API を優先）。
 *
 * モバイル: Web Share API Level 2（files）が利用可能ならシェアシート起動
 *   （写真アプリ等への保存／他アプリへ共有）。利用不可・キャンセル・エラー時は
 *   通常のブラウザダウンロードへ fallback。
 * デスクトップ: 通常のブラウザダウンロード。
 *
 * 生成結果のグリッド／リスト／拡大表示モーダルに加え、投稿詳細とスタイル画面の
 * ダウンロード動線もこの関数に統一する。
 */
export async function shareOrDownloadGeneratedImage(
  image: DownloadableImage,
  messages: DownloadMessages,
  callbacks?: DownloadCallbacks,
): Promise<void> {
  if (!isMobileUserAgent()) {
    await downloadGeneratedImage(image, messages, callbacks);
    return;
  }

  let payload: FetchedImagePayload;
  try {
    // CORS 許可の get（モバイル share 用は cors mode が必要なケースがある）
    payload = await fetchImagePayload(image, messages, { mode: "cors" });
  } catch {
    // CORS で失敗した場合は通常 fetch にフォールバック
    payload = await fetchImagePayload(image, messages);
  }

  const file = new File([payload.blob], payload.fileName, {
    type: payload.mimeType,
  });

  if (
    typeof navigator !== "undefined" &&
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: "Persta.AI" });
      callbacks?.onShareSuccess?.();
      return;
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : "";
      // ユーザーキャンセルや user gesture 不足は無視（保存しない）
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        message.includes("user gesture") ||
        message.includes("share request")
      ) {
        return;
      }
      // それ以外のエラーはダウンロードへ fallback
    }
  }

  triggerBrowserDownload(payload);
  callbacks?.onDownloadSuccess?.();
}
