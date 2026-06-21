import "server-only";

import {
  callOpenAIImageEdit,
  callOpenAIImageEditMultiInput,
  parseImageDimensions,
  type OpenAIImageEditResult,
} from "@/features/generation/lib/openai-image";
import {
  GUEST_ALLOWED_MODELS,
  parseGuestRequestedModel,
} from "@/features/generation/lib/model-config";
import {
  extractImageSize,
  isOpenAIImageModel,
  parseGptImage2Model,
  toApiModelName,
  type GeminiModel,
  type GeminiOnlyModel,
} from "@/features/generation/types";
import {
  extractImagesFromGeminiResponse,
  type GeminiResponse,
} from "@/features/generation/lib/nanobanana";
import {
  ALLOWED_IMAGE_MIME_TYPE_SET,
  MAX_IMAGE_BYTES,
} from "@/features/i2i-poc/shared/image-constraints";
import { getGptImage2TargetSize } from "@/shared/generation/openai-image-model";
import {
  normalizeStyleOutputAspectRatioMode,
  resolveOutputAspectRatio,
  type StyleOutputAspectRatioMode,
} from "@/shared/generation/style-output-aspect-ratio";
import { aspectLabelToDimensions } from "@/shared/generation/gemini-aspect-ratio";
import {
  isOpenAIProviderErrorMessage,
  isSafetyPolicyBlockedErrorMessage,
  sanitizeProviderErrorMessage,
} from "@/shared/generation/errors";

/**
 * 画面横断ゲスト sync 経路の共通ヘルパ。
 *
 * - 認証ユーザーは guest 経路に来てはいけない（UCL-014 / ADR-007）
 * - ゲストは GUEST_ALLOWED_MODELS のモデルしか選べない（UCL-001）
 * - 入力エラー（MIME / size / GIF on OpenAI）は reserve 前に検出して試行を消費させない（UCL-011c）
 * - モデル呼び出しは Gemini と OpenAI の両方を扱う
 * - レート制限の reserve / release は呼び出し側（route handler）が制御する
 *
 * 関連:
 * - 計画書: docs/planning/unify-style-coordinate-usage-limits-plan.md
 * - レート制限: features/generation/lib/guest-rate-limit.ts
 */

export const GUEST_GEMINI_TIMEOUT_MS = 35_000;
export const GUEST_OPENAI_TIMEOUT_MS = 90_000;

const GEMINI_GENERATE_CONTENT_URL = (apiModel: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent`;

/**
 * UCL-014: 認証済みユーザーが guest sync を直接叩いた場合に拒否するための型情報。
 * route handler は `assertGuestRequest()` で判定する。
 */
export interface GuestAuthGuardForbidden {
  kind: "auth_forbidden";
  errorCode: "GUEST_ROUTE_AUTHENTICATED_FORBIDDEN";
}

export const GUEST_AUTH_FORBIDDEN: GuestAuthGuardForbidden = {
  kind: "auth_forbidden",
  errorCode: "GUEST_ROUTE_AUTHENTICATED_FORBIDDEN",
};

export type GuestAuthGuardResult = { kind: "guest" } | GuestAuthGuardForbidden;

/**
 * 認証済みユーザーが guest sync route を呼んだら 403 で拒否するための判定。
 * 呼び出し側は `result.kind === "auth_forbidden"` のときに対応するレスポンスを返す。
 */
export function assertGuestRequest(
  user: { id?: string } | null | undefined
): GuestAuthGuardResult {
  if (user) {
    return GUEST_AUTH_FORBIDDEN;
  }
  return { kind: "guest" };
}

/**
 * クライアントから受け取った生の `model` をゲスト用に検証する。
 * 既知のモデル ID で、かつ GUEST_ALLOWED_MODELS に含まれているなら canonical を返す。
 * それ以外は null（呼び出し側で 400 にする）。
 */
export function parseGuestModelInput(
  raw: string | null | undefined
): GeminiModel | null {
  return parseGuestRequestedModel(raw);
}

export interface GuestImageInputValidationFailure {
  kind: "input_error";
  errorCode: "GUEST_INVALID_IMAGE" | "GUEST_INVALID_MODEL_FOR_IMAGE";
  message: string;
}

export type GuestImageInputValidationResult =
  | { kind: "ok" }
  | GuestImageInputValidationFailure;

/**
 * UCL-011c: reserve に到達する前に弾くべき入力エラー。
 *
 * - 未対応 MIME / 上限サイズ超過 → GUEST_INVALID_IMAGE
 * - GIF を GPT Image 2 に投げようとしている → GUEST_INVALID_MODEL_FOR_IMAGE
 *   （OpenAI 側で reject されると "ユーザー側起因の失敗" として release 扱いに
 *    なる前に明示で弾くため、reserve 前に検出する）
 */
export function validateGuestImageInput(input: {
  uploadImage: File;
  model: GeminiModel;
  invalidImageMessage: string;
  imageTooLargeMessage: string;
  gifNotSupportedByOpenAIMessage: string;
}): GuestImageInputValidationResult {
  const normalizedType = input.uploadImage.type.toLowerCase().trim();

  // OpenAI は GIF 非対応（Deno 版 openai-image.ts の挙動と揃える）
  if (
    isOpenAIImageModel(input.model) &&
    normalizedType === "image/gif"
  ) {
    return {
      kind: "input_error",
      errorCode: "GUEST_INVALID_MODEL_FOR_IMAGE",
      message: input.gifNotSupportedByOpenAIMessage,
    };
  }

  // 共通の MIME / size 検証。GIF は OpenAI 以外（Gemini）では受け入れる。
  // ALLOWED_IMAGE_MIME_TYPE_SET は PNG / JPEG / WebP を含む。
  const allowed =
    ALLOWED_IMAGE_MIME_TYPE_SET.has(normalizedType) ||
    normalizedType === "image/gif";
  if (!allowed) {
    return {
      kind: "input_error",
      errorCode: "GUEST_INVALID_IMAGE",
      message: input.invalidImageMessage,
    };
  }
  if (input.uploadImage.size > MAX_IMAGE_BYTES) {
    return {
      kind: "input_error",
      errorCode: "GUEST_INVALID_IMAGE",
      message: input.imageTooLargeMessage,
    };
  }

  return { kind: "ok" };
}

export type DispatchGuestImageGenerationResult =
  | { kind: "success"; imageDataUrl: string; mimeType: string }
  | { kind: "safety_blocked" }
  | { kind: "no_image"; finishReasons: string[]; retryable: boolean }
  | { kind: "timeout" }
  | { kind: "upstream_error"; message: string; status: number }
  | { kind: "openai_provider_error"; message: string }
  | { kind: "user_input_error"; message: string };

export interface DispatchGuestImageGenerationInput {
  model: GeminiModel;
  promptText: string;
  uploadImage: File;
  referenceImage?: File | null;
  outputAspectRatioMode?: StyleOutputAspectRatioMode;
  geminiApiKey: string;
  openaiApiKey?: string;
  geminiTimeoutMs?: number;
  openaiTimeoutMs?: number;
  /**
   * Gemini fetch のモック注入用。既定は global fetch。
   */
  fetchFn?: typeof fetch;
  /**
   * OpenAI 呼び出しのモック注入用。既定は本物の callOpenAIImageEdit。
   */
  openaiClient?: typeof callOpenAIImageEdit;
  /**
   * OpenAI 複数画像入力呼び出しのモック注入用。referenceImage がある場合のみ使う。
   */
  openaiMultiInputClient?: typeof callOpenAIImageEditMultiInput;
}

const RETRYABLE_NO_IMAGE_FINISH_REASONS = new Set(["MALFORMED_FUNCTION_CALL"]);

interface GeminiContentInlineDataPart {
  inline_data: { mime_type: string; data: string };
}
interface GeminiContentTextPart {
  text: string;
}
type GeminiContentPart = GeminiContentTextPart | GeminiContentInlineDataPart;

/**
 * File から base64 inline data part と aspect ratio 解決用 dimensions を一度の I/O で取得する。
 * Gemini API へ送る `generationConfig.imageConfig.aspectRatio` の決定に使う。
 */
async function fileToInlineDataPartWithDimensions(
  file: File
): Promise<{
  part: GeminiContentInlineDataPart;
  dimensions: { width: number; height: number } | null;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const data = Buffer.from(arrayBuffer).toString("base64");
  const dimensions = parseImageDimensions(bytes, file.type);
  return {
    part: {
      inline_data: {
        mime_type: file.type,
        data,
      },
    },
    dimensions,
  };
}

function getFinishReasons(payload: GeminiResponse | null): string[] {
  if (!payload?.candidates || payload.candidates.length === 0) {
    return [];
  }
  const reasons = payload.candidates
    .map((candidate) => candidate.finishReason?.trim())
    .filter((reason): reason is string => Boolean(reason));
  return Array.from(new Set(reasons));
}

function isSafetyBlockedResponse(payload: GeminiResponse | null): boolean {
  if (!payload) {
    return false;
  }
  const withPromptFeedback = payload as GeminiResponse & {
    promptFeedback?: { blockReason?: string };
  };
  if (typeof withPromptFeedback.promptFeedback?.blockReason === "string") {
    return true;
  }
  if (!payload.candidates || payload.candidates.length === 0) {
    return false;
  }
  return payload.candidates.some(
    (candidate) => candidate.finishReason?.toUpperCase() === "SAFETY"
  );
}

/**
 * 1 回分のモデル呼び出し（リトライしない）。
 * リトライポリシーが必要な呼び出し側（/style/generate の reinforcement リトライなど）は、
 * `result.kind === "no_image"` かつ `retryable === true` を見て再呼び出しする。
 */
export async function dispatchGuestImageGeneration(
  input: DispatchGuestImageGenerationInput
): Promise<DispatchGuestImageGenerationResult> {
  if (isOpenAIImageModel(input.model)) {
    return dispatchOpenAI(input);
  }
  return dispatchGemini(input);
}

async function dispatchOpenAI(
  input: DispatchGuestImageGenerationInput
): Promise<DispatchGuestImageGenerationResult> {
  const arrayBuffer = await input.uploadImage.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const openaiClient = input.openaiClient ?? callOpenAIImageEdit;
  const openaiMultiInputClient =
    input.openaiMultiInputClient ?? callOpenAIImageEditMultiInput;
  const gptImage2 = parseGptImage2Model(input.model);
  if (!gptImage2) {
    return {
      kind: "openai_provider_error",
      message: `Invalid GPT Image 2 model: ${input.model}`,
    };
  }
  try {
    // 明示比率なら、その比率の寸法から OpenAI 出力サイズを決める(GPT Image 2 も非正方形可)。
    // source は undefined にして入力画像ベース(従来挙動)に委ねる。
    const aspectMode = normalizeStyleOutputAspectRatioMode(
      input.outputAspectRatioMode,
    );
    const targetSize =
      aspectMode === "source"
        ? undefined
        : getGptImage2TargetSize(
            gptImage2.sizeTier,
            aspectLabelToDimensions(aspectMode),
          );
    let result: OpenAIImageEditResult;
    if (input.referenceImage) {
      const referenceArrayBuffer = await input.referenceImage.arrayBuffer();
      const referenceBase64 =
        Buffer.from(referenceArrayBuffer).toString("base64");
      const [multiInputResult] = await openaiMultiInputClient({
        prompt: input.promptText,
        inputImages: [
          { base64, mimeType: input.uploadImage.type },
          {
            base64: referenceBase64,
            mimeType: input.referenceImage.type || "image/webp",
          },
        ],
        targetSizeBaseIndex: 0,
        timeoutMs: input.openaiTimeoutMs ?? GUEST_OPENAI_TIMEOUT_MS,
        quality: gptImage2.quality,
        sizeTier: gptImage2.sizeTier,
        targetSize,
        apiKey: input.openaiApiKey,
        n: 1,
      });
      if (!multiInputResult) {
        throw new Error("No images generated");
      }
      result = multiInputResult;
    } else {
      result = await openaiClient({
        prompt: input.promptText,
        inputImage: { base64, mimeType: input.uploadImage.type },
        timeoutMs: input.openaiTimeoutMs ?? GUEST_OPENAI_TIMEOUT_MS,
        quality: gptImage2.quality,
        sizeTier: gptImage2.sizeTier,
        targetSize,
        apiKey: input.openaiApiKey,
      });
    }
    return {
      kind: "success",
      imageDataUrl: `data:${result.mimeType};base64,${result.data}`,
      mimeType: result.mimeType,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { kind: "timeout" };
    }
    const message = sanitizeProviderErrorMessage(
      error instanceof Error ? error.message : String(error)
    );
    if (isSafetyPolicyBlockedErrorMessage(message)) {
      return { kind: "safety_blocked" };
    }
    if (isOpenAIProviderErrorMessage(message)) {
      // GIF など user-fixable 系は validateGuestImageInput で先に弾いている想定。
      // ここに来るのは構成不備（API key 不正 / 残高不足 / 組織未検証など）。
      return { kind: "openai_provider_error", message };
    }
    if (/no images generated/i.test(message)) {
      return { kind: "no_image", finishReasons: [], retryable: false };
    }
    return { kind: "upstream_error", message, status: 502 };
  }
}

async function dispatchGemini(
  input: DispatchGuestImageGenerationInput
): Promise<DispatchGuestImageGenerationResult> {
  const fetchImpl = input.fetchFn ?? fetch;
  const apiModel = toApiModelName(input.model as GeminiOnlyModel);
  const imageSize = extractImageSize(input.model as GeminiOnlyModel);
  const { part: imagePart, dimensions: inputDimensions } =
    await fileToInlineDataPartWithDimensions(input.uploadImage);
  // モード="source" は入力比率を自動スナップ、明示比率はその比率で出力する。
  const aspectRatio = resolveOutputAspectRatio(
    input.outputAspectRatioMode,
    inputDimensions,
  );
  const parts: GeminiContentPart[] = [
    { text: input.promptText },
    imagePart,
  ];
  if (input.referenceImage) {
    const { part: referenceImagePart } =
      await fileToInlineDataPartWithDimensions(input.referenceImage);
    parts.push(referenceImagePart);
  }

  const abortController = new AbortController();
  const timeoutMs = input.geminiTimeoutMs ?? GUEST_GEMINI_TIMEOUT_MS;
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(GEMINI_GENERATE_CONTENT_URL(apiModel), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": input.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          candidateCount: 1,
          responseModalities: ["TEXT", "IMAGE"],
          // 出力アスペクトを 9:16 〜 16:9 にクランプするため、imageSize 有無に関わらず
          // aspectRatio を必ず付与する。
          imageConfig: imageSize ? { imageSize, aspectRatio } : { aspectRatio },
        },
      }),
      signal: abortController.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { kind: "timeout" };
    }
    const message = sanitizeProviderErrorMessage(
      error instanceof Error ? error.message : String(error)
    );
    return { kind: "upstream_error", message, status: 502 };
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = (await response.json().catch(() => null)) as
    | GeminiResponse
    | { error?: { message?: string } }
    | null;
  const geminiPayload = (payload ?? null) as GeminiResponse | null;

  if (!response.ok) {
    const apiErrorMessage =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error?.message === "string"
        ? sanitizeProviderErrorMessage(payload.error.message)
        : `Gemini API request failed (HTTP ${response.status})`;
    if (
      isSafetyBlockedResponse(geminiPayload) ||
      /safety|blocked|block_reason|policy|prohibited/i.test(apiErrorMessage)
    ) {
      return { kind: "safety_blocked" };
    }
    return {
      kind: "upstream_error",
      message: apiErrorMessage,
      status: response.status,
    };
  }

  if (isSafetyBlockedResponse(geminiPayload)) {
    return { kind: "safety_blocked" };
  }

  const images = extractImagesFromGeminiResponse(
    (geminiPayload ?? {}) as GeminiResponse
  );
  if (images.length > 0) {
    const firstImage = images[0];
    return {
      kind: "success",
      imageDataUrl: `data:${firstImage.mimeType};base64,${firstImage.data}`,
      mimeType: firstImage.mimeType,
    };
  }

  const finishReasons = getFinishReasons(geminiPayload);
  const retryable = finishReasons.some((reason) =>
    RETRYABLE_NO_IMAGE_FINISH_REASONS.has(reason)
  );
  return { kind: "no_image", finishReasons, retryable };
}

/**
 * UCL-011a: dispatch 結果が「上流側起因の失敗」かどうかを判定する。
 * route handler はこれが true なら reserve を release する。
 *
 * - timeout / upstream_error (5xx) / no_image / openai_provider_error (構成不備) → release
 * - safety_blocked / user_input_error → 維持（消費）
 * - success → release しない（成功は元々消費が正解）
 */
export function shouldReleaseReservationFor(
  result: DispatchGuestImageGenerationResult
): boolean {
  switch (result.kind) {
    case "timeout":
      return true;
    case "openai_provider_error":
      return true;
    case "no_image":
      return true;
    case "upstream_error":
      return result.status >= 500;
    case "safety_blocked":
      return false;
    case "user_input_error":
      return false;
    case "success":
      return false;
  }
}

/**
 * GUEST_ALLOWED_MODELS の参照を再エクスポート（呼び出し側からの import を 1 か所で済ませる）。
 */
export { GUEST_ALLOWED_MODELS };
