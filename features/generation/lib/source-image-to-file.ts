/**
 * 画像 URL を fetch → Blob → File に変換し、自然画像サイズ込みの UploadedImage を作る。
 *
 * 既存の apply-from-history-event リスナー (GenerationForm.tsx) で行われていた
 * 「URL → File 化 + naturalWidth/naturalHeight 取得」を共通化したもの。
 * 画像ソースピッカーの「生成済み」タブ選択時にも同じ経路を使う。
 *
 * `<img>` の onload を待ってから resolve するため、ピッカー側は呼び出し直後に
 * `handleImageUpload()` へ渡せば即座にプレビュー表示できる。
 */
export interface UploadedImagePayload {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

export interface FetchSourceImageOptions {
  /** ファイル名のヒント (拡張子は MIME から推定するため不要)。 */
  fileNameHint?: string;
  /** プリロード待ちのタイムアウト (ms)。既定 5000。 */
  preloadTimeoutMs?: number;
}

const DEFAULT_PRELOAD_TIMEOUT_MS = 5_000;
const DEFAULT_FILE_NAME_HINT = "history-source";
const FALLBACK_DIMENSION = 1024;

export async function fetchSourceImageAsUploadedImage(
  imageUrl: string,
  options: FetchSourceImageOptions = {}
): Promise<UploadedImagePayload> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status}`);
  }

  const blob = await res.blob();
  const mimeType = blob.type || "image/png";
  const ext = mimeType.split("/")[1]?.split("+")[0] ?? "png";
  const fileName = `${options.fileNameHint ?? DEFAULT_FILE_NAME_HINT}.${ext}`;
  const file = new File([blob], fileName, { type: mimeType });
  const previewUrl = URL.createObjectURL(file);

  try {
    const { width, height } = await preloadImage(
      previewUrl,
      options.preloadTimeoutMs ?? DEFAULT_PRELOAD_TIMEOUT_MS
    );
    return { file, previewUrl, width, height };
  } catch (err) {
    URL.revokeObjectURL(previewUrl);
    throw err;
  }
}

function preloadImage(
  src: string,
  timeoutMs: number
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error(`preload timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve({
        width: img.naturalWidth || FALLBACK_DIMENSION,
        height: img.naturalHeight || FALLBACK_DIMENSION,
      });
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("image load error"));
    };
    img.src = src;
  });
}
