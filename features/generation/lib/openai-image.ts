import "server-only";

/**
 * OpenAI gpt-image-2 (quality=low) の Node ランタイム向けクライアント。
 *
 * 同等の Deno 実装が `supabase/functions/image-gen-worker/openai-image.ts` にあり、
 * Edge Function ワーカーで使われている。本ファイルは新設の guest sync ルート
 * (`features/generation/lib/guest-generate.ts`) から呼ぶための Node 版。
 *
 * 互換性: 戻り値の形 / エラー文言 / GIF 拒否 / アスペクト比から `1024x*` 解決 等は
 * Deno 版とビット同等にする（変更時は両方を同期させること）。共有エラー定数は
 * `shared/generation/errors.ts` を参照する。
 *
 * 参照: docs/planning/unify-style-coordinate-usage-limits-plan.md ADR-005
 */

import {
  OPENAI_PROVIDER_ERROR,
  SAFETY_POLICY_BLOCKED_ERROR,
} from "@/shared/generation/errors";

const OPENAI_IMAGES_EDITS_URL = "https://api.openai.com/v1/images/edits";

export type OpenAITargetSize = "1024x1024" | "1024x1536" | "1536x1024";

export interface OpenAIImageInput {
  base64: string;
  mimeType: string;
}

export interface CallOpenAIImageEditParams {
  prompt: string;
  inputImage: OpenAIImageInput;
  timeoutMs: number;
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

export interface OpenAIImageEditResult {
  data: string;
  mimeType: "image/png";
}

/**
 * Base64 文字列を Uint8Array に展開（Deno 版の `decodeBase64` 互換）。
 */
function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
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
  input: OpenAIImageInput
): OpenAITargetSize {
  const lower = input.mimeType.toLowerCase();
  if (lower === "image/gif") {
    // GIF は呼び出し側で拒否されるはずだが、フォールバックとして正方形を返す
    return "1024x1024";
  }
  const bytes = decodeBase64(input.base64);
  const dims = parseImageDimensions(bytes, input.mimeType);
  if (!dims) {
    return "1024x1024";
  }
  const aspect = dims.width / dims.height;
  if (aspect < 0.85) return "1024x1536";
  if (aspect > 1.18) return "1536x1024";
  return "1024x1024";
}

/**
 * OpenAI gpt-image-2 (quality=low) を呼び出して画像編集を実行する Node 版。
 *
 * Deno 版と同じ振る舞い:
 * - GIF 入力は再試行不可エラーで早期失敗（OPENAI_PROVIDER_ERROR プレフィックス付き）
 * - HTTP 400 + content_policy_violation または message に moderation/safety を含む
 *   → SAFETY_POLICY_BLOCKED_ERROR を throw
 * - 認証 / 残高 / API key 系の構成不備 → OPENAI_PROVIDER_ERROR プレフィックス付きで throw
 * - 他の HTTP 非 2xx → upstream message を Error として throw
 * - data[0].b64_json が空 → "No images generated"
 */
export async function callOpenAIImageEdit(
  params: CallOpenAIImageEditParams
): Promise<OpenAIImageEditResult> {
  const apiKey = params.apiKey ?? process.env.OPENAI_API_KEY;
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

  const targetSize = resolveOpenAITargetSize(params.inputImage);
  const bytes = decodeBase64(params.inputImage.base64);
  // BlobPart 型に合わせるため ArrayBuffer に変換（Uint8Array 直渡しは TS が拒否する）
  const file = new File([bytes.buffer as ArrayBuffer], "input.png", {
    type: params.inputImage.mimeType,
  });

  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("prompt", params.prompt);
  form.append("image[]", file);
  form.append("size", targetSize);
  form.append("quality", "low");
  form.append("moderation", "auto");
  form.append("output_format", "png");
  form.append("n", "1");

  const fetchImpl = params.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await fetchImpl(OPENAI_IMAGES_EDITS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      const code = errorPayload?.error?.code ?? "";
      const message =
        errorPayload?.error?.message ?? `OpenAI HTTP ${response.status}`;
      if (
        response.status === 400 &&
        (code === "content_policy_violation" ||
          /moderation|safety/i.test(message))
      ) {
        throw new Error(SAFETY_POLICY_BLOCKED_ERROR);
      }
      const isAuthFailure = response.status === 401 || response.status === 403;
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

    const json = (await response.json().catch(() => ({}))) as {
      data?: Array<{ b64_json?: string }>;
    };
    const b64 = json?.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || b64.length === 0) {
      throw new Error("No images generated");
    }
    return { data: b64, mimeType: "image/png" };
  } finally {
    clearTimeout(timeoutId);
  }
}
