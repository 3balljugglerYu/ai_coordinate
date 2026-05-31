import "server-only";

/**
 * OpenAI gpt-image-2 の Node ランタイム向けクライアント。
 *
 * `quality` (low/medium/high) と `sizeTier` (1k/2k/4k) は呼び出し側から必須で渡す。
 * inspire のように合成難度が高い経路では `quality: "medium"` を指定して品質を引き上げる。
 *
 * 同等の Deno 実装が `supabase/functions/image-gen-worker/openai-image.ts` にあり、
 * Edge Function ワーカーで使われている。本ファイルは新設の guest sync ルート
 * (`features/generation/lib/guest-generate.ts`) から呼ぶための Node 版。
 *
 * 互換性: 戻り値の形 / エラー文言 / GIF 拒否 / アスペクト比からの size 解決 等は
 * Deno 版とビット同等にする（変更時は両方を同期させること）。共有エラー定数は
 * `shared/generation/errors.ts` を参照する。
 *
 * 参照: docs/planning/unify-style-coordinate-usage-limits-plan.md ADR-005
 */

import {
  OPENAI_PROVIDER_ERROR,
  SAFETY_POLICY_BLOCKED_ERROR,
} from "@/shared/generation/errors";
import {
  getGptImage2TargetSize,
} from "@/shared/generation/openai-image-model";
import type {
  GptImage2Quality,
  GptImage2SizeTier,
  GptImage2TargetSize,
} from "@/shared/generation/openai-image-model";

const OPENAI_IMAGES_EDITS_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_MAX_ATTEMPTS = 3;
const OPENAI_RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const OPENAI_BASE_RETRY_DELAY_MS = 1000;
// UI/API の request timeout 内に収めるため、Retry-After が長くても 30 秒で打ち切る。
const OPENAI_MAX_RETRY_AFTER_MS = 30_000;

export type OpenAITargetSize = GptImage2TargetSize;

export interface OpenAIImageInput {
  base64: string;
  mimeType: string;
}

export interface CallOpenAIImageEditParams {
  prompt: string;
  inputImage: OpenAIImageInput;
  timeoutMs: number;
  quality: GptImage2Quality;
  sizeTier: GptImage2SizeTier;
  targetSize?: OpenAITargetSize;
  /**
   * fetch 実装の差し替え用（テストでモック注入する）。
   * 既定では Node の global fetch を使う。
   */
  fetchFn?: typeof fetch;
  /**
   * API キーの差し替え用。既定では `process.env.OPENAI_API_KEY` を読む。
   */
  apiKey?: string;
}

/**
 * 多枚画像入力版（inspire 機能、ADR-006）。
 *
 * `image[]` フィールドに複数 append する。配列順で送信され、出力フレームのアスペクト比は
 * `targetSizeBaseIndex` で指定された画像（既定 = 0）を起点に算出される。
 *
 * inspire 経路では targetSizeBaseIndex=1 を渡してテンプレ画像（image_1）の比率に揃える。
 */
export interface CallOpenAIImageEditMultiInputParams {
  prompt: string;
  inputImages: ReadonlyArray<OpenAIImageInput>;
  timeoutMs: number;
  quality: GptImage2Quality;
  sizeTier: GptImage2SizeTier;
  /**
   * 出力フレーム比率の起点とする入力画像のインデックス。既定は 0（先頭画像）。
   * inspire 経路では 1（テンプレ画像）を指定する。
   */
  targetSizeBaseIndex?: number;
  targetSize?: OpenAITargetSize;
  fetchFn?: typeof fetch;
  apiKey?: string;
  n?: number;
}

export interface OpenAIImageEditResult {
  data: string;
  mimeType: "image/png";
}

export interface CallOpenAIImageEditBatchParams
  extends CallOpenAIImageEditParams {
  n?: number;
}

/**
 * Base64 文字列を Uint8Array に展開（Deno 版の `decodeBase64` 互換）。
 */
function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRetryAfterMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, OPENAI_MAX_RETRY_AFTER_MS);
    }
    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) {
      return Math.min(
        Math.max(dateMs - Date.now(), 0),
        OPENAI_MAX_RETRY_AFTER_MS
      );
    }
  }
  return Math.min(OPENAI_BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), 8000);
}

async function readOpenAIErrorPayload(response: Response): Promise<{
  code: string;
  message: string;
}> {
  const errorPayload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;
  return {
    code: errorPayload?.error?.code ?? "",
    message: errorPayload?.error?.message ?? `OpenAI HTTP ${response.status}`,
  };
}

function throwOpenAIResponseError(
  status: number,
  code: string,
  message: string
): never {
  if (
    status === 400 &&
    (code === "content_policy_violation" ||
      /moderation|safety/i.test(message))
  ) {
    throw new Error(SAFETY_POLICY_BLOCKED_ERROR);
  }
  const isAuthFailure = status === 401 || status === 403;
  const isInvalidApiKey =
    code === "invalid_api_key" || /incorrect api key/i.test(message);
  const isInsufficientQuota = code === "insufficient_quota";
  const isUnverifiedOrg = /must be verified/i.test(message);
  if (
    isAuthFailure ||
    isInvalidApiKey ||
    isInsufficientQuota ||
    isUnverifiedOrg
  ) {
    throw new Error(`${OPENAI_PROVIDER_ERROR}: ${message}`);
  }
  throw new Error(message);
}

/**
 * 画像ヘッダーから width/height を抽出。PNG/JPEG/WebP に対応。
 * 解析できない場合は null。
 *
 * 実装は Deno 版と同等。
 */
export function parseImageDimensions(
  bytes: Uint8Array,
  mimeType: string
): { width: number; height: number } | null {
  const lower = mimeType.toLowerCase();

  // PNG: 8 byte signature, then IHDR chunk (4 byte length + 4 byte "IHDR" + 4 byte width + 4 byte height)
  if (lower === "image/png") {
    if (bytes.length < 24) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // JPEG: SOI (FFD8) → 各セグメントを走査して SOF0/SOF1/SOF2/SOF3 (FFC0..FFC3) で width/height
  if (lower === "image/jpeg" || lower === "image/jpg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0x00 || marker === 0xff) {
        i++;
        continue;
      }
      if (
        marker === 0xc0 ||
        marker === 0xc1 ||
        marker === 0xc2 ||
        marker === 0xc3
      ) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        return width > 0 && height > 0 ? { width, height } : null;
      }
      const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
      if (segLen < 2) return null;
      i += 2 + segLen;
    }
    return null;
  }

  // WebP: RIFF コンテナの 12-15 が "VP8 " / "VP8L" / "VP8X"
  if (lower === "image/webp") {
    if (bytes.length < 30) return null;
    if (
      String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "RIFF" ||
      String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) !== "WEBP"
    ) {
      return null;
    }
    const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (tag === "VP8 ") {
      const w = ((bytes[27] << 8) | bytes[26]) & 0x3fff;
      const h = ((bytes[29] << 8) | bytes[28]) & 0x3fff;
      return w > 0 && h > 0 ? { width: w, height: h } : null;
    }
    if (tag === "VP8L") {
      const b0 = bytes[21];
      const b1 = bytes[22];
      const b2 = bytes[23];
      const b3 = bytes[24];
      const w = 1 + (((b1 & 0x3f) << 8) | b0);
      const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return w > 0 && h > 0 ? { width: w, height: h } : null;
    }
    if (tag === "VP8X") {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return w > 0 && h > 0 ? { width: w, height: h } : null;
    }
    return null;
  }

  return null;
}

/**
 * 入力画像のアスペクト比から OpenAI 出力サイズを決定。
 * 解析失敗時は 1024x1024 にフォールバック。
 */
export function resolveOpenAITargetSize(
  input: OpenAIImageInput,
  sizeTier: GptImage2SizeTier = "1k"
): OpenAITargetSize {
  const lower = input.mimeType.toLowerCase();
  if (lower === "image/gif") {
    // GIF は呼び出し側で拒否されるはずだが、フォールバックとして正方形を返す
    return getGptImage2TargetSize(sizeTier, null);
  }
  const bytes = decodeBase64(input.base64);
  const dims = parseImageDimensions(bytes, input.mimeType);
  return getGptImage2TargetSize(sizeTier, dims);
}

/**
 * OpenAI gpt-image-2 を呼び出して画像編集を実行する Node 版。
 *
 * Deno 版と同じ振る舞い:
 * - GIF 入力は再試行不可エラーで早期失敗（OPENAI_PROVIDER_ERROR プレフィックス付き）
 * - HTTP 400 + content_policy_violation または message に moderation/safety を含む
 *   → SAFETY_POLICY_BLOCKED_ERROR を throw
 * - 認証 / 残高 / API key 系の構成不備 → OPENAI_PROVIDER_ERROR プレフィックス付きで throw
 * - 他の HTTP 非 2xx → upstream message を Error として throw
 * - data[].b64_json が空 → "No images generated"
 */
function resolveRequestedImageCount(n: number | undefined): number {
  const requested = n ?? 1;
  if (!Number.isInteger(requested) || requested < 1 || requested > 10) {
    throw new Error("OpenAI image edit n must be an integer between 1 and 10");
  }
  return requested;
}

export async function callOpenAIImageEditBatch(
  params: CallOpenAIImageEditBatchParams
): Promise<OpenAIImageEditResult[]> {
  const apiKey = params.apiKey ?? process.env.OPENAI_API_KEY;
  const requestedImageCount = resolveRequestedImageCount(params.n);
  if (!apiKey) {
    throw new Error(
      `${OPENAI_PROVIDER_ERROR}: OPENAI_API_KEY is not configured`
    );
  }

  if (params.inputImage.mimeType.toLowerCase() === "image/gif") {
    throw new Error(
      `${OPENAI_PROVIDER_ERROR}: GIF images are not supported by gpt-image-2; please upload PNG, JPEG, or WebP`
    );
  }

  const targetSize =
    params.targetSize ??
    resolveOpenAITargetSize(params.inputImage, params.sizeTier);
  const bytes = decodeBase64(params.inputImage.base64);

  const buildForm = () => {
    // BlobPart 型に合わせるため ArrayBuffer に変換（Uint8Array 直渡しは TS が拒否する）
    const file = new File([bytes.buffer as ArrayBuffer], "input.png", {
      type: params.inputImage.mimeType,
    });
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("prompt", params.prompt);
    form.append("image[]", file);
    form.append("size", targetSize);
    form.append("quality", params.quality);
    form.append("moderation", "low");
    form.append("output_format", "png");
    form.append("n", String(requestedImageCount));
    return form;
  };

  const fetchImpl = params.fetchFn ?? fetch;
  for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);
    try {
      const response = await fetchImpl(OPENAI_IMAGES_EDITS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: buildForm(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const { code, message } = await readOpenAIErrorPayload(response);
        if (code === "insufficient_quota") {
          throwOpenAIResponseError(response.status, code, message);
        }
        if (
          attempt < OPENAI_MAX_ATTEMPTS &&
          OPENAI_RETRYABLE_STATUS.has(response.status)
        ) {
          await sleep(resolveRetryAfterMs(response, attempt));
          continue;
        }
        throwOpenAIResponseError(response.status, code, message);
      }

      const json = (await response.json().catch(() => ({}))) as {
        data?: Array<{ b64_json?: string }>;
      };
      const results = (json?.data ?? [])
        .map((item) => item?.b64_json)
        .filter((b64): b64 is string => typeof b64 === "string" && b64.length > 0)
        .map((b64) => ({ data: b64, mimeType: "image/png" as const }));

      if (results.length === 0) {
        throw new Error("No images generated");
      }

      if (results.length !== requestedImageCount) {
        throw new Error(
          `OpenAI image edit returned ${results.length} images, expected ${requestedImageCount}`
        );
      }

      return results;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error("OpenAI image edit failed after retries");
}

export async function callOpenAIImageEdit(
  params: CallOpenAIImageEditParams
): Promise<OpenAIImageEditResult> {
  const [result] = await callOpenAIImageEditBatch({ ...params, n: 1 });
  return result;
}

/**
 * 多枚画像入力版の呼び出し（inspire 機能、ADR-006）。
 *
 * - inputImages を `image[]` フィールドに順番に append する
 * - 出力フレーム比率は targetSizeBaseIndex（既定 0）を起点に算出
 * - その他の挙動（GIF 拒否、エラー分類、レスポンス形）は単数版と同等
 */
export async function callOpenAIImageEditMultiInput(
  params: CallOpenAIImageEditMultiInputParams
): Promise<OpenAIImageEditResult[]> {
  const apiKey = params.apiKey ?? process.env.OPENAI_API_KEY;
  const requestedImageCount = resolveRequestedImageCount(params.n);
  if (!apiKey) {
    throw new Error(
      `${OPENAI_PROVIDER_ERROR}: OPENAI_API_KEY is not configured`
    );
  }

  if (params.inputImages.length === 0) {
    throw new Error("inputImages must not be empty");
  }

  for (const img of params.inputImages) {
    if (img.mimeType.toLowerCase() === "image/gif") {
      throw new Error(
        `${OPENAI_PROVIDER_ERROR}: GIF images are not supported by gpt-image-2; please upload PNG, JPEG, or WebP`
      );
    }
  }

  const baseIndex = params.targetSizeBaseIndex ?? 0;
  const baseImage =
    params.inputImages[baseIndex] ?? params.inputImages[0];
  const targetSize =
    params.targetSize ?? resolveOpenAITargetSize(baseImage, params.sizeTier);

  const buildForm = () => {
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("prompt", params.prompt);
    for (let idx = 0; idx < params.inputImages.length; idx++) {
      const img = params.inputImages[idx];
      const bytes = decodeBase64(img.base64);
      const file = new File(
        [bytes.buffer as ArrayBuffer],
        `input_${idx}.png`,
        { type: img.mimeType }
      );
      form.append("image[]", file);
    }
    form.append("size", targetSize);
    form.append("quality", params.quality);
    form.append("moderation", "low");
    form.append("output_format", "png");
    form.append("n", String(requestedImageCount));
    return form;
  };

  const fetchImpl = params.fetchFn ?? fetch;
  for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);
    try {
      const response = await fetchImpl(OPENAI_IMAGES_EDITS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: buildForm(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const { code, message } = await readOpenAIErrorPayload(response);
        if (code === "insufficient_quota") {
          throwOpenAIResponseError(response.status, code, message);
        }
        if (
          attempt < OPENAI_MAX_ATTEMPTS &&
          OPENAI_RETRYABLE_STATUS.has(response.status)
        ) {
          await sleep(resolveRetryAfterMs(response, attempt));
          continue;
        }
        throwOpenAIResponseError(response.status, code, message);
      }

      const json = (await response.json().catch(() => ({}))) as {
        data?: Array<{ b64_json?: string }>;
      };
      const results = (json?.data ?? [])
        .map((item) => item?.b64_json)
        .filter((b64): b64 is string => typeof b64 === "string" && b64.length > 0)
        .map((b64) => ({ data: b64, mimeType: "image/png" as const }));

      if (results.length === 0) {
        throw new Error("No images generated");
      }

      if (results.length !== requestedImageCount) {
        throw new Error(
          `OpenAI image edit returned ${results.length} images, expected ${requestedImageCount}`
        );
      }

      return results;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error("OpenAI image edit failed after retries");
}
