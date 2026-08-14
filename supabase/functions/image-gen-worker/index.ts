// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import { decodeBase64, encodeBase64 } from "jsr:@std/encoding@1/base64";
import {
  buildPrompt as buildSharedPrompt,
  buildCoordinateAttemptReinforcementPrefix,
  buildInspirePrompt,
  resolveBackgroundMode,
  resolveInspireTargetSizeBaseIndex,
} from "../../../shared/generation/prompt-core.ts";
import {
  composeCreatorLooksPrompt,
  composeBackgroundStagePrompt,
} from "./creator-looks-prompt.ts";
import type { GenerationType } from "../../../shared/generation/prompt-core.ts";
import { buildStyleAttemptReinforcementPrefix } from "../../../shared/generation/style-prompts.ts";
import { getFramingModeFromGenerationMetadata } from "../../../shared/generation/framing-mode.ts";
import {
  type CreatorLooksMode,
  getCreatorLooksModeFromGenerationMetadata,
  creatorLooksModeFromOverrides,
} from "../../../shared/generation/creator-looks-mode.ts";
import {
  GEMINI_DISABLED_MESSAGE,
  GEMINI_PROVIDER_ERROR,
  MALFORMED_GEMINI_PARTS_ERROR,
  isInvalidGeminiArgumentErrorMessage,
  isGeminiProviderErrorMessage,
  isMalformedGeminiPartsErrorMessage,
  SAFETY_POLICY_BLOCKED_ERROR,
  isSafetyPolicyBlockedErrorMessage,
  isOpenAIProviderErrorMessage,
  sanitizeProviderErrorMessage,
} from "../../../shared/generation/errors.ts";
import {
  getOneTapStylePresetMetadata,
  getOneTapStyleReservedAttemptId,
} from "../../../shared/generation/one-tap-style-metadata.ts";
import {
  GPT_IMAGE_2_PERCOIN_COSTS,
  isGptImage2CanonicalModel,
  normalizeLegacyGptImage2Model,
  parseGptImage2Model,
} from "../../../shared/generation/openai-image-model.ts";
import type { GptImage2CanonicalModel } from "../../../shared/generation/openai-image-model.ts";
import {
  resolveGeminiAspectRatio,
  type GeminiAspectRatio,
} from "../../../shared/generation/gemini-aspect-ratio.ts";
import {
  resolveJobOutputAspectRatio,
  resolveOpenAIOutputTargetSize,
} from "../../../shared/generation/job-output-aspect.ts";
import { mergeSuccessGenerationMetadata } from "../../../shared/generation/job-metadata.ts";
import {
  callOpenAIImageEditBatch,
  callOpenAIImageEditMultiInputBatch,
  parseImageDimensions,
} from "./openai-image.ts";
import { buildGeminiGenerationConfig } from "./gemini-request-config.ts";
import { resolveAllPromptTemplatesForWorker } from "./prompt-override.ts";
import {
  type PromptExecutionRecord,
  resolvePromptExecutionInput,
} from "./prompt-execution.ts";
import {
  resolveRecordedPercoinRefundAmount,
  settleFailedJobBilling,
} from "./failed-job-billing.ts";

/**
 * 画像生成ワーカー Edge Function
 * Supabase Queueからメッセージを読み取り、画像生成ジョブを処理
 */

const QUEUE_NAME = "image_jobs";
const VISIBILITY_TIMEOUT = 60; // 秒
const MAX_MESSAGES = 20; // 1回の読み取りで取得する最大メッセージ数
const STORAGE_BUCKET = "generated-images";
const PROCESSING_STALE_TIMEOUT_SECONDS = 360; // processing状態がこの秒数を超えたら異常とみなす

const INPUT_IMAGE_FETCH_MAX_ATTEMPTS = 3;
const INPUT_IMAGE_FETCH_RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const INPUT_IMAGE_FETCH_TIMEOUT_MS = 15_000;

const OPENAI_REQUEST_TIMEOUT_MS = 90_000;
// quality ティアごとに OpenAI 側の処理時間が大きく異なるため個別に拡張する
const OPENAI_REQUEST_TIMEOUT_HIGH_MS = 300_000;
const OPENAI_REQUEST_TIMEOUT_MEDIUM_MS = 180_000;

function resolveOpenAIRequestTimeoutMs(
  parsed: NonNullable<ReturnType<typeof parseGptImage2Model>>
): number {
  if (parsed.quality === "high") {
    return OPENAI_REQUEST_TIMEOUT_HIGH_MS;
  }
  if (parsed.quality === "medium") {
    return OPENAI_REQUEST_TIMEOUT_MEDIUM_MS;
  }
  return OPENAI_REQUEST_TIMEOUT_MS;
}

// Gemini 側も SKU ごとに処理時間が大きく異なるため、canonical model ID から
// タイムアウトを引く。特に Nano Banana Pro 4K は数分かかるため余裕を持たせる。
const GEMINI_REQUEST_TIMEOUT_DEFAULT_MS = 60_000;

function resolveGeminiRequestTimeoutMs(dbModel: string): number {
  switch (dbModel) {
    case "gemini-3.1-flash-image-preview-512":
      return 60_000;
    case "gemini-2.5-flash-image":
    case "gemini-3.1-flash-image-preview-1024":
    case "gemini-3-pro-image-1k":
      return 90_000;
    case "gemini-3-pro-image-2k":
      return 180_000;
    case "gemini-3-pro-image-4k":
      return 300_000;
    default:
      return GEMINI_REQUEST_TIMEOUT_DEFAULT_MS;
  }
}
const GEMINI_GENERATION_ENABLED =
  Deno.env.get("GEMINI_GENERATION_ENABLED") === "true";

type GeminiAttemptMetadata = {
  attempt: number;
  startedAt: string;
  durationMs: number;
  httpStatus: number | null;
  httpOk: boolean;
  finishReasons: string[];
  hasImage: boolean;
  timedOut: boolean;
  errorMessage: string | null;
  reinforcementApplied: boolean;
};

function extractGeminiFinishReasons(payload: GeminiResponse | null | undefined): string[] {
  if (!payload?.candidates || payload.candidates.length === 0) {
    return [];
  }
  const reasons = payload.candidates
    .map((candidate) => candidate?.finishReason?.trim())
    .filter((reason): reason is string => Boolean(reason));
  return Array.from(new Set(reasons));
}

type InputImageData = {
  base64: string;
  mimeType: string;
};

type GeneratedImageResult = {
  mimeType: string;
  data: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notifyEnsureWebPVariants(
  siteUrl: string,
  cronSecret: string,
  imageId: string
): Promise<void> {
  try {
    const endpoint = new URL(
      "/api/internal/generated-images/ensure-webp",
      siteUrl
    ).toString();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ imageId }),
    });

    if (!response.ok) {
      console.error("[Job Success] Failed to notify WebP generation", {
        imageId,
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    console.error("[Job Success] Failed to notify WebP generation", {
      imageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function scheduleEnsureWebPVariantsNotification(
  siteUrl: string,
  cronSecret: string,
  imageId: string
): void {
  const task = notifyEnsureWebPVariants(siteUrl, cronSecret, imageId);

  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(task);
    return;
  }

  void task;
}

async function notifyPersistBeforeImage(
  siteUrl: string,
  cronSecret: string,
  generatedImageId: string
): Promise<void> {
  try {
    const endpoint = new URL(
      "/api/internal/generated-images/persist-before-image",
      siteUrl
    ).toString();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ generatedImageId }),
    });

    if (!response.ok) {
      console.error("[Job Success] Failed to notify Before image persistence", {
        generatedImageId,
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    console.error("[Job Success] Failed to notify Before image persistence", {
      generatedImageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function schedulePersistBeforeImageNotification(
  siteUrl: string,
  cronSecret: string,
  generatedImageId: string
): void {
  const task = notifyPersistBeforeImage(siteUrl, cronSecret, generatedImageId);

  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(task);
    return;
  }

  void task;
}

function isRetryableFetchStatus(status: number): boolean {
  return INPUT_IMAGE_FETCH_RETRYABLE_STATUS.has(status);
}

function parseStorageObjectFromUrl(inputImageUrl: string): { bucket: string; objectPath: string } | null {
  try {
    const url = new URL(inputImageUrl);
    const markers = [
      "/storage/v1/object/public/",
      "/storage/v1/object/sign/",
      "/storage/v1/object/authenticated/",
    ];

    for (const marker of markers) {
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex === -1) continue;

      const rest = url.pathname.slice(markerIndex + marker.length);
      const [bucketRaw, ...pathParts] = rest.split("/");
      if (!bucketRaw || pathParts.length === 0) return null;

      return {
        bucket: decodeURIComponent(bucketRaw),
        objectPath: decodeURIComponent(pathParts.join("/")),
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function downloadInputImageFromUrlWithRetry(inputImageUrl: string): Promise<InputImageData> {
  let lastStatus: number | null = null;
  let lastStatusText = "";
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= INPUT_IMAGE_FETCH_MAX_ATTEMPTS; attempt++) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      INPUT_IMAGE_FETCH_TIMEOUT_MS
    );
    try {
      const response = await fetch(inputImageUrl, {
        signal: abortController.signal,
      });
      if (response.ok) {
        const imageBlob = await response.blob();
        const mimeType = imageBlob.type || "image/png";
        const arrayBuffer = await imageBlob.arrayBuffer();
        return {
          base64: encodeBase64(new Uint8Array(arrayBuffer)),
          mimeType,
        };
      }

      lastStatus = response.status;
      lastStatusText = response.statusText || "";
      if (!isRetryableFetchStatus(response.status)) {
        break;
      }
    } catch (error) {
      lastStatus = null;
      lastError =
        error instanceof Error && error.name === "AbortError"
          ? new Error(
              `URL download timed out after ${INPUT_IMAGE_FETCH_TIMEOUT_MS}ms`
            )
          : error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (attempt < INPUT_IMAGE_FETCH_MAX_ATTEMPTS) {
      const backoffMs = 200 * attempt;
      await sleep(backoffMs);
    }
  }

  if (lastStatus !== null) {
    throw new Error(`URL download failed: ${lastStatus} ${lastStatusText}`.trim());
  }
  const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError ?? "Unknown error");
  throw new Error(`URL download failed: ${lastErrorMessage}`);
}

async function withInputImageFetchTimeout<T>(
  operation: PromiseLike<T>,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              new Error(
                `${label} timed out after ${INPUT_IMAGE_FETCH_TIMEOUT_MS}ms`
              )
            ),
          INPUT_IMAGE_FETCH_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

type StorageDownloadResult = {
  data: Blob | null;
  error: { message: string } | null;
};

async function downloadInputImageViaStorageFallback(
  supabase: ReturnType<typeof createClient>,
  inputImageUrl: string
): Promise<InputImageData> {
  const location = parseStorageObjectFromUrl(inputImageUrl);
  if (!location) {
    throw new Error("Storage path could not be parsed from input_image_url");
  }

  const { data, error } = await withInputImageFetchTimeout<StorageDownloadResult>(
    supabase.storage.from(location.bucket).download(location.objectPath),
    "Storage fallback download"
  );

  if (error || !data) {
    throw new Error(`Storage fallback download failed: ${error?.message ?? "Unknown error"}`);
  }

  const mimeType = data.type || "image/png";
  const arrayBuffer = await data.arrayBuffer();
  return {
    base64: encodeBase64(new Uint8Array(arrayBuffer)),
    mimeType,
  };
}

/**
 * Inspire 用: style-templates private bucket からテンプレ画像を取得する。
 * `job.style_reference_image_url` は Storage 内のオブジェクトパス文字列。
 */
async function downloadStyleTemplateImage(
  supabase: ReturnType<typeof createClient>,
  storagePath: string
): Promise<InputImageData> {
  const { data, error } = await withInputImageFetchTimeout<StorageDownloadResult>(
    supabase.storage.from("style-templates").download(storagePath),
    "Style template download"
  );

  if (error || !data) {
    throw new Error(
      `Style template download failed: ${error?.message ?? "Unknown error"}`
    );
  }

  const mimeType = data.type || "image/png";
  const arrayBuffer = await data.arrayBuffer();
  return {
    base64: encodeBase64(new Uint8Array(arrayBuffer)),
    mimeType,
  };
}

/**
 * One-Tap Style dual モード用: style_presets bucket から admin が登録した
 * 参考画像 (image_1) を取得する。`job.style_reference_image_url` は
 * `{presetId}/reference.webp` 形式の storage path。
 */
async function downloadStylePresetReferenceImage(
  supabase: ReturnType<typeof createClient>,
  storagePath: string
): Promise<InputImageData> {
  const { data, error } = await withInputImageFetchTimeout<StorageDownloadResult>(
    supabase.storage.from("style_presets").download(storagePath),
    "Style preset reference download"
  );

  if (error || !data) {
    throw new Error(
      `Style preset reference download failed: ${error?.message ?? "Unknown error"}`
    );
  }

  const mimeType = data.type || "image/webp";
  const arrayBuffer = await data.arrayBuffer();
  return {
    base64: encodeBase64(new Uint8Array(arrayBuffer)),
    mimeType,
  };
}

/**
 * One-Tap Style dual + user_upload モード用: generated-images bucket の
 * temp/{user_id}/... に user が /style-async でアップロードした参考画像を取得する。
 * 設計判断は docs/planning/style-preset-user-dual-and-prompt-implementation-plan.md ADR-005 参照。
 *
 * セキュリティ: path 先頭が `temp/` であることを必ず検証してから download する
 * (= bucket 内の他 path への横展開を防ぐ)。
 */
async function downloadGeneratedImagesTempReferenceImage(
  supabase: ReturnType<typeof createClient>,
  storagePath: string
): Promise<InputImageData> {
  if (!storagePath.startsWith("temp/")) {
    throw new Error(
      `generated-images temp reference must start with 'temp/' (got: ${storagePath})`
    );
  }
  const { data, error } = await withInputImageFetchTimeout<StorageDownloadResult>(
    supabase.storage.from("generated-images").download(storagePath),
    "Style preset user_upload reference download"
  );

  if (error || !data) {
    throw new Error(
      `Style preset user_upload reference download failed: ${error?.message ?? "Unknown error"}`
    );
  }

  const mimeType = data.type || "image/webp";
  const arrayBuffer = await data.arrayBuffer();
  return {
    base64: encodeBase64(new Uint8Array(arrayBuffer)),
    mimeType,
  };
}

/**
 * dual + user_upload の reference temp 画像を、ジョブ成功後に削除する。
 * 失敗しても生成結果は壊さず、既存 cleanup cron に委ねる。
 */
async function deleteGeneratedImagesTempReferenceImageIfExists(
  supabase: ReturnType<typeof createClient>,
  storagePath: string | null
): Promise<void> {
  if (!storagePath?.startsWith("temp/")) {
    return;
  }

  const { error } = await supabase.storage
    .from("generated-images")
    .remove([storagePath]);

  if (error) {
    console.warn(
      "[Worker] failed to cleanup one_tap_style user_upload reference image",
      {
        path: storagePath,
        error: error.message,
      }
    );
  }
}

/**
 * one_tap_style の image_1 取得元 bucket / path を job から解決する pure helper (ADR-005)。
 * - `style_reference_image_bucket` 明示値があればそれを使う
 * - NULL (旧 job 互換) は 'style_presets' fallback
 * - 'generated-images' の場合は path 先頭が `temp/` であることを呼び出し側で再検証する
 *
 * 戻り値: image_1 が無いジョブ (= style_reference_image_url なし) なら null
 */
export function resolveStyleReferenceImageLocation(job: {
  style_reference_image_url?: string | null;
  style_reference_image_bucket?: string | null;
}): { bucket: "style_presets" | "generated-images"; path: string } | null {
  const path = job.style_reference_image_url;
  if (typeof path !== "string" || path.length === 0) return null;
  const bucket =
    job.style_reference_image_bucket === "generated-images"
      ? "generated-images"
      : "style_presets";
  return { bucket, path };
}

async function downloadInputImageViaStockFallback(
  supabase: ReturnType<typeof createClient>,
  sourceImageStockId: string
): Promise<InputImageData> {
  const { data: stock, error: stockError } = await supabase
    .from("source_image_stocks")
    .select("id, storage_path, image_url")
    .eq("id", sourceImageStockId)
    .maybeSingle();

  if (stockError) {
    throw new Error(`Stock lookup failed: ${stockError.message}`);
  }
  if (!stock) {
    throw new Error("Stock image not found");
  }

  let storagePathError = "";
  if (stock.storage_path) {
    const { data, error } = await withInputImageFetchTimeout<StorageDownloadResult>(
      supabase.storage.from(STORAGE_BUCKET).download(stock.storage_path),
      "Stock fallback download"
    );

    if (!error && data) {
      const mimeType = data.type || "image/png";
      const arrayBuffer = await data.arrayBuffer();
      return {
        base64: encodeBase64(new Uint8Array(arrayBuffer)),
        mimeType,
      };
    }
    storagePathError = error?.message ?? "Unknown error";
  }

  if (stock.image_url) {
    return await downloadInputImageViaStorageFallback(supabase, stock.image_url);
  }

  throw new Error(
    `Stock fallback failed: no usable source (storage_path_error=${storagePathError || "none"})`
  );
}

// 型定義
// 注: 名称は歴史的経緯で GeminiModel のまま。OpenAI 系も含むため新コードでは
// プロバイダ判定に isOpenAIImageModel を使用すること。
type GeminiModel =
  | "gemini-2.5-flash-image"
  | "gemini-3.1-flash-image-preview-512"
  | "gemini-3.1-flash-image-preview-1024"
  | "gemini-3-pro-image-1k"
  | "gemini-3-pro-image-2k"
  | "gemini-3-pro-image-4k"
  | GptImage2CanonicalModel;
type GeminiApiModel =
  | "gemini-2.5-flash-image"
  | "gemini-3.1-flash-image-preview"
  | "gemini-3-pro-image-preview";
type GeminiImageSize = "512" | "1K" | "2K" | "4K";
const WORKER_UNKNOWN_MODEL_FALLBACK: GeminiModel = "gemini-2.5-flash-image";

/**
 * モデル ID が OpenAI 系 (gpt-image-*) かを判定
 */
function isOpenAIImageModel(model: string | null | undefined): boolean {
  return typeof model === "string" && model.startsWith("gpt-image-");
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
        inline_data?: {
          mime_type: string;
          data: string;
        };
      }>;
    };
    finishReason?: string;
    safetyRatings?: Array<{
      category?: string;
      probability?: string;
    }>;
  }>;
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: Array<{
      category?: string;
      probability?: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * モデル名を正規化（データベース保存用）
 */
function normalizeModelName(model: string | null): GeminiModel {
  if (!model) {
    return WORKER_UNKNOWN_MODEL_FALLBACK;
  }
  const normalizedGptImage2 = normalizeLegacyGptImage2Model(model);
  if (isGptImage2CanonicalModel(normalizedGptImage2)) {
    return normalizedGptImage2;
  }
  if (isOpenAIImageModel(model)) {
    throw new Error(`Invalid GPT Image 2 model: ${model}`);
  }
  if (model === "gemini-2.5-flash-image-preview" || model === "gemini-2.5-flash-image") {
    return "gemini-3.1-flash-image-preview-512";
  }
  if (model === "gemini-3.1-flash-image-preview") {
    return "gemini-3.1-flash-image-preview-512";
  }
  if (
    model === "gemini-3.1-flash-image-preview-512" ||
    model === "gemini-3.1-flash-image-preview-1024"
  ) {
    return model as GeminiModel;
  }
  if (model === "gemini-3-pro-image-preview" || model === "gemini-3-pro-image") {
    return "gemini-3-pro-image-2k";
  }
  if (model === "gemini-3-pro-image-1k" || model === "gemini-3-pro-image-2k" || model === "gemini-3-pro-image-4k") {
    return model as GeminiModel;
  }
  console.warn("[image-gen-worker] unknown model received:", model);
  return WORKER_UNKNOWN_MODEL_FALLBACK;
}

/**
 * データベース保存値をAPIエンドポイント名に変換
 */
function toApiModelName(model: GeminiModel): GeminiApiModel {
  if (model.startsWith("gemini-3.1-flash-image-preview-")) {
    return "gemini-3.1-flash-image-preview";
  }
  if (model.startsWith("gemini-3-pro-image-")) {
    return "gemini-3-pro-image-preview";
  }
  return "gemini-2.5-flash-image";
}

/**
 * モデル名から画像サイズを抽出
 */
function extractImageSize(model: GeminiModel): GeminiImageSize | null {
  if (model === "gemini-3.1-flash-image-preview-512") return "512";
  if (model === "gemini-3.1-flash-image-preview-1024") return "1K";
  if (model === "gemini-3-pro-image-1k") return "1K";
  if (model === "gemini-3-pro-image-2k") return "2K";
  if (model === "gemini-3-pro-image-4k") return "4K";
  return null;
}

/**
 * モデル名からペルコインコストを取得
 */
function getPercoinCost(model: string | null): number {
  const normalized = normalizeModelName(model);
  const costs: Record<string, number> = {
    'gemini-2.5-flash-image': 20,
    'gemini-3.1-flash-image-preview-512': 10,
    'gemini-3.1-flash-image-preview-1024': 20,
    'gemini-3-pro-image-1k': 50,
    'gemini-3-pro-image-2k': 80,
    'gemini-3-pro-image-4k': 100,
    ...GPT_IMAGE_2_PERCOIN_COSTS,
  };
  return costs[normalized] ?? 20;
}

// Creator Looks 2段階(衣装＋背景)の割引率。
// features/generation/lib/model-config.ts の CREATOR_LOOKS_TWO_STAGE_DISCOUNT と必ず一致させること。
const CREATOR_LOOKS_TWO_STAGE_DISCOUNT = 0.9;

/**
 * Creator Looks のモード別ペルコイン消費量(API 残高チェックの creatorLooksCost と一致させる)。
 * - 衣装のみ / 背景のみ(1回): モデルコスト
 * - 衣装＋背景(2段階): ceil(モデルコスト × 2 × 0.9)
 */
function creatorLooksWorkerCost(
  model: string | null,
  mode: CreatorLooksMode,
): number {
  const base = getPercoinCost(model);
  if (mode === "outfit_and_background") {
    return Math.ceil(base * 2 * CREATOR_LOOKS_TWO_STAGE_DISCOUNT);
  }
  return base;
}

function getGenerationPercoinAmount(job: {
  model: string | null;
  generation_metadata?: unknown;
}): number {
  const normalizedModel = normalizeModelName(job.model);
  // Creator Looks 生成モード(metadata)があればモード別コスト(2段階=ceil(×2×0.9))を使う。
  // (= API 層の残高チェックと一致させ、過少/過大課金を防ぐ)
  const clMode = getCreatorLooksModeFromGenerationMetadata(
    job.generation_metadata,
  );
  if (clMode) {
    return creatorLooksWorkerCost(normalizedModel, clMode);
  }
  // 1回の生成 = 1枚(複数枚生成は 2026-08-15 に廃止)
  return getPercoinCost(normalizedModel);
}

/**
 * 再試行不可のエラーか判定
 */
/**
 * 生成実行入力が欠落・不整合のときに投げる固定内部コード。
 *
 * 復旧不能な状態なので再試行しない。リトライすると、減算済みペルコインの
 * 返金が次回配送まで遅れ、課金RPC・snapshot 検索・worker 起動がもう一度走る。
 */
const GENERATION_PROMPT_EXECUTION_MISSING =
  "GENERATION_PROMPT_EXECUTION_MISSING";

/**
 * 派生生成の原作が利用できないときに投げる固定内部コード。
 *
 * 削除・投稿取消・公開停止・非公開解除・フォロー解除・ブロックのいずれでも
 * 同じコードにする。理由を分けると、そこから原作の状態を推測できてしまう
 * （ADR-005）。復旧不能なので再試行しない。
 */
const DERIVED_PROMPT_SOURCE_UNAVAILABLE = "DERIVED_PROMPT_SOURCE_UNAVAILABLE";

/**
 * 最終失敗したジョブの課金後処理を冪等に実行する。
 *
 * 判定と順序は failed-job-billing.ts に隔離し（Jest でテスト可能にするため）、
 * ここでは Supabase への副作用を注入するだけにする。
 *
 * @returns 完了したか。false のときメッセージを ack してはならない。
 */
async function settleFailedJobBillingWithSupabase(
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    jobId: string;
    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    job: any;
    errorMessage: string;
    isFreeOneTapStyleJob: boolean;
    reservedAttemptId: string | null;
  },
): Promise<boolean> {
  const { jobId, job, errorMessage, isFreeOneTapStyleJob, reservedAttemptId } =
    params;

  return await settleFailedJobBilling({
    jobId,
    isFreeOneTapStyleJob,
    reservedAttemptId,
    errorMessage,
    releaseFreeAttempt: (attemptId, releaseReason) =>
      releaseStyleAuthenticatedGenerateAttempt(
        supabase,
        attemptId,
        releaseReason,
      ),
    refundPercoins: () =>
      refundPercoinsFromGeneration(
        supabase,
        job.user_id,
        jobId,
      ),
    logInfo: (message) => console.log(`[Job Processing] ${message}`),
    logError: (message, error) =>
      console.error(`[Job Processing] ${message}`, error),
  });
}

function isNonRetriableGenerationError(errorMessage: string): boolean {
  return (
    errorMessage === GENERATION_PROMPT_EXECUTION_MISSING ||
    errorMessage === DERIVED_PROMPT_SOURCE_UNAVAILABLE ||
    errorMessage === "No images generated" ||
    isInvalidGeminiArgumentErrorMessage(errorMessage) ||
    isMalformedGeminiPartsErrorMessage(errorMessage) ||
    isGeminiProviderErrorMessage(errorMessage) ||
    isSafetyPolicyBlockedErrorMessage(errorMessage) ||
    isOpenAIProviderErrorMessage(errorMessage)
  );
}

function isSafetyBlockReason(blockReason: string | undefined): boolean {
  if (!blockReason) return false;
  const normalized = blockReason.toUpperCase();
  return (
    normalized === "SAFETY" ||
    normalized === "IMAGE_SAFETY" ||
    normalized === "PROHIBITED_CONTENT" ||
    normalized === "BLOCKLIST"
  );
}

function isSafetyFinishReason(finishReason: string | undefined): boolean {
  if (!finishReason) return false;
  const normalized = finishReason.toUpperCase();
  return normalized === "SAFETY" || normalized === "IMAGE_SAFETY";
}

function isGeminiSafetyBlocked(response: GeminiResponse): boolean {
  if (isSafetyBlockReason(response.promptFeedback?.blockReason)) {
    return true;
  }

  if (!response.candidates || response.candidates.length === 0) {
    return false;
  }

  return response.candidates.some((candidate) =>
    isSafetyFinishReason(candidate?.finishReason)
  );
}

/**
 * ペルコイン減算処理（deduct_free_percoins RPC 経由）
 */
async function deductPercoinsFromGeneration(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  generationId: string,
  percoinAmount: number
): Promise<void> {
  try {
    console.log(`[Percoin Deduction] Starting deduction for user ${userId}, job ${generationId}, amount ${percoinAmount}`);

    const { data, error } = await supabase.rpc("deduct_free_percoins", {
      p_user_id: userId,
      p_amount: percoinAmount,
      p_metadata: {
        reason: "image_generation",
        source: "edge_function",
        job_id: generationId,
      },
      p_related_generation_id: null,
    });

    if (error) {
      throw new Error(`ペルコイン減算に失敗しました: ${error.message}`);
    }

    const result = Array.isArray(data) ? data[0] : data;
    console.log(
      `[Percoin Deduction] Success. balance=${result?.balance ?? "?"}, from_promo=${result?.from_promo ?? "?"}, from_paid=${result?.from_paid ?? "?"}`
    );
  } catch (error) {
    console.error("[Percoin Deduction] Error deducting percoins:", error);
    throw error;
  }
}

/**
 * ペルコイン返金処理（refund_percoins RPC 経由、冪等性保証付き）
 */
async function refundPercoinsFromGeneration(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  jobId: string,
): Promise<void> {
  try {
    // reconciliation は価格改定後に走る可能性があるため、現在の料金表から
    // 返金額を再計算しない。減算時の credit_transactions.amount を正本にする。
    // allocation を持つ現行データでは、この絶対値が DB 側の allocation 合計と
    // 一致しなければ refund_percoins が fail closed する。
    const { data: consumptionTx, error: consumptionError } = await supabase
      .from("credit_transactions")
      .select("id, amount, metadata")
      .eq("user_id", userId)
      .eq("transaction_type", "consumption")
      .eq("metadata->>job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (consumptionError) {
      throw new Error(`消費履歴の確認に失敗しました: ${consumptionError.message}`);
    }

    if (!consumptionTx) {
      console.warn(`[Percoin Refund] Consumption transaction not found for job ${jobId}, skipping refund`);
      return;
    }

    const percoinAmount = resolveRecordedPercoinRefundAmount(
      consumptionTx.amount,
    );
    console.log(
      `[Percoin Refund] Starting refund for user ${userId}, job ${jobId}, amount ${percoinAmount}`,
    );

    const metadata = (consumptionTx.metadata as { from_promo?: number; from_paid?: number } | null) ?? {};
    const refundToPromo = Math.max(0, Math.min(percoinAmount, Number(metadata.from_promo ?? percoinAmount)));
    const refundToPaid = Math.max(0, percoinAmount - refundToPromo);

    const { error } = await supabase.rpc("refund_percoins", {
      p_user_id: userId,
      p_amount: percoinAmount,
      p_to_promo: refundToPromo,
      p_to_paid: refundToPaid,
      p_job_id: jobId,
      p_metadata: {
        reason: "image_generation_failed",
        source: "edge_function",
      },
    });

    if (error) {
      throw new Error(`ペルコイン返金に失敗しました: ${error.message}`);
    }

    console.log(
      `[Percoin Refund] Success. requested_to_promo=${refundToPromo}, requested_to_paid=${refundToPaid}`
    );
  } catch (error) {
    console.error("[Percoin Refund] Error refunding percoins:", error);
    throw error;
  }
}

async function releaseStyleAuthenticatedGenerateAttempt(
  supabase: ReturnType<typeof createClient>,
  attemptId: string,
  reason: "no_image_generated" | "worker_failed" | "infra_error"
): Promise<void> {
  const { error } = await supabase.rpc(
    "release_style_authenticated_generate_attempt",
    {
      p_attempt_id: attemptId,
      p_release_reason: reason,
      p_released_at: new Date().toISOString(),
    }
  );

  if (error) {
    throw error;
  }
}

/**
 * Gemini APIレスポンスから画像データを抽出
 */
function extractImagesFromGeminiResponse(response: GeminiResponse): Array<{ mimeType: string; data: string }> {
  const images: Array<{ mimeType: string; data: string }> = [];

  if (!response.candidates) {
    return images;
  }

  for (let candidateIndex = 0; candidateIndex < response.candidates.length; candidateIndex++) {
    const candidate = response.candidates[candidateIndex];
    const parts = candidate?.content?.parts;

    if (!Array.isArray(parts)) {
      console.error("[Gemini Response] Malformed candidate content:", {
        candidateIndex,
        finishReason: candidate?.finishReason ?? null,
        hasContent: Boolean(candidate?.content),
        contentKeys: candidate?.content ? Object.keys(candidate.content) : [],
        partsType: parts === null ? "null" : typeof parts,
      });
      throw new Error(MALFORMED_GEMINI_PARTS_ERROR);
    }

    for (const part of parts) {
      if (part.inlineData) {
        images.push({
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data,
        });
      } else if (part.inline_data) {
        images.push({
          mimeType: part.inline_data.mime_type,
          data: part.inline_data.data,
        });
      }
    }
  }

  return images;
}

/**
 * Creator Looks 2段階生成(衣装＋背景)の「段階1: 衣装着せ(背景維持)」を1回だけ実行し、
 * 中間画像(衣装を着せた image_0)を返す(方式A)。
 *
 * - image_0(ユーザーキャラ) + image_1(参照画像) + 衣装プロンプトで生成する。
 * - リトライ・計測・課金はしない(本体の段階2側で計測/課金/返金する)。
 * - Gemini / OpenAI(gpt-image-2) の両モデルに対応。アスペクト比は image_0 基準。
 * - 戻り値は段階2の image_0 として使う。
 */
async function generateCreatorLooksOutfitStage(params: {
  dbModel: string;
  apiModel: string;
  geminiApiKey: string;
  image0: InputImageData;
  image1: InputImageData;
  prompt: string;
}): Promise<InputImageData> {
  const { dbModel, apiModel, geminiApiKey, image0, image1, prompt } = params;

  if (isOpenAIImageModel(dbModel)) {
    const gptImage2 = parseGptImage2Model(dbModel);
    if (!gptImage2) {
      throw new Error(`Invalid GPT Image 2 model: ${dbModel}`);
    }
    const [result] = await callOpenAIImageEditMultiInputBatch({
      prompt,
      inputImages: [image0, image1],
      // 衣装着せの出力フレームは image_0(ユーザーキャラ)基準に固定する。
      targetSizeBaseIndex: 0,
      timeoutMs: resolveOpenAIRequestTimeoutMs(gptImage2),
      quality: gptImage2.quality,
      sizeTier: gptImage2.sizeTier,
      n: 1,
    });
    if (!result) {
      throw new Error("Creator Looks stage1(outfit) produced no image");
    }
    return { base64: result.data, mimeType: result.mimeType };
  }

  // ===== Gemini 経路 =====
  const aspectDims = parseImageDimensions(
    decodeBase64(image0.base64),
    image0.mimeType,
  );
  const aspectRatio = resolveGeminiAspectRatio(aspectDims);
  const imageSize = extractImageSize(dbModel);
  const requiresResponseModalities =
    apiModel === "gemini-3.1-flash-image-preview";

  const requestBody = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: image0.mimeType, data: image0.base64 } },
          { inline_data: { mime_type: image1.mimeType, data: image1.base64 } },
          { text: prompt },
        ],
      },
    ],
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
    generationConfig: buildGeminiGenerationConfig({
      imageSize,
      aspectRatio,
      requiresResponseModalities,
    }),
  };

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey,
    },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    throw new Error(
      `Creator Looks stage1(outfit) Gemini request failed: ${response.status}`,
    );
  }
  const data = (await response.json()) as GeminiResponse;
  if (isGeminiSafetyBlocked(data)) {
    throw new Error(SAFETY_POLICY_BLOCKED_ERROR);
  }
  const images = extractImagesFromGeminiResponse(data);
  if (images.length === 0) {
    throw new Error("Creator Looks stage1(outfit) produced no image");
  }
  return { base64: images[0].data, mimeType: images[0].mimeType };
}

/**
 * Data URLからBase64を抽出
 */
function extractBase64FromDataUrl(dataUrl: string): { base64: string; mimeType: string } | null {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) {
    return null;
  }
  return {
    mimeType: matches[1],
    base64: matches[2],
  };
}

type TimedProcessingStage =
  | "charging"
  | "generating"
  | "uploading"
  | "persisting";

type StageDurationsMs = Partial<Record<TimedProcessingStage, number>>;

type GeneratingSubstep =
  | "inputPreparation"
  | "geminiRequest"
  | "providerRequest"
  | "responseProcessing";

type GeneratingSubstepDurationsMs = Partial<Record<GeneratingSubstep, number>>;

const TIMED_STAGE_LABELS: Record<TimedProcessingStage, string> = {
  charging: "ペルコイン減算",
  generating: "Gemini画像生成",
  uploading: "Storage保存",
  persisting: "DB反映",
};

const GENERATING_SUBSTEP_LABELS: Record<GeneratingSubstep, string> = {
  inputPreparation: "入力画像準備・プロンプト構築",
  geminiRequest: "Gemini API呼び出し",
  providerRequest: "画像生成プロバイダ API呼び出し",
  responseProcessing: "応答解析",
};

function formatDurationMs(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined || Number.isNaN(durationMs)) {
    return "-";
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function buildStageDurationSummary(stageDurationsMs: StageDurationsMs): string {
  return (Object.keys(TIMED_STAGE_LABELS) as TimedProcessingStage[])
    .map(
      (stage) =>
        `${stage}(${TIMED_STAGE_LABELS[stage]})=${formatDurationMs(stageDurationsMs[stage])}`
    )
    .join(",");
}

function buildGeneratingSubstepSummary(
  substepDurationsMs: GeneratingSubstepDurationsMs
): string {
  return (Object.keys(GENERATING_SUBSTEP_LABELS) as GeneratingSubstep[])
    .map(
      (substep) =>
        `${substep}(${GENERATING_SUBSTEP_LABELS[substep]})=${formatDurationMs(
          substepDurationsMs[substep]
        )}`
    )
    .join(",");
}

function logJobTimeline(
  jobId: string,
  message: string,
  details?: Record<string, string | number | boolean | null | undefined>
): void {
  const formattedDetails = details
    ? Object.entries(details)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" ")
    : "";

  console.log(
    `[Job Timeline] ${message} jobId=${jobId}${formattedDetails ? ` ${formattedDetails}` : ""}`
  );
}

function logJobTimingSummary(params: {
  jobId: string;
  outcome: "ジョブ完了" | "ジョブ失敗" | "ジョブスキップ";
  queueWaitMs: number | null;
  workerDurationMs: number;
  totalDurationMs: number | null;
  stageDurationsMs: StageDurationsMs;
  currentStage?: TimedProcessingStage | null;
  errorMessage?: string | null;
}): void {
  const {
    jobId,
    outcome,
    queueWaitMs,
    workerDurationMs,
    totalDurationMs,
    stageDurationsMs,
    currentStage,
    errorMessage,
  } = params;

  logJobTimeline(jobId, outcome, {
    queueWait: formatDurationMs(queueWaitMs),
    workerTotal: formatDurationMs(workerDurationMs),
    total: formatDurationMs(totalDurationMs),
    currentStage: currentStage
      ? `${currentStage}(${TIMED_STAGE_LABELS[currentStage]})`
      : "-",
    stages: buildStageDurationSummary(stageDurationsMs),
    error: errorMessage ?? undefined,
  });
}

async function measureJobStage<T>(
  jobId: string,
  stage: TimedProcessingStage,
  stageDurationsMs: StageDurationsMs,
  run: () => Promise<T>
): Promise<T> {
  const startedAtMs = Date.now();

  logJobTimeline(jobId, "ステージ開始", {
    stage,
    label: TIMED_STAGE_LABELS[stage],
  });

  try {
    const result = await run();
    const durationMs = Date.now() - startedAtMs;
    stageDurationsMs[stage] = durationMs;

    logJobTimeline(jobId, "ステージ完了", {
      stage,
      label: TIMED_STAGE_LABELS[stage],
      duration: formatDurationMs(durationMs),
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    stageDurationsMs[stage] = durationMs;

    logJobTimeline(jobId, "ステージ失敗", {
      stage,
      label: TIMED_STAGE_LABELS[stage],
      duration: formatDurationMs(durationMs),
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

async function measureGeneratingSubstep<T>(
  jobId: string,
  substep: GeneratingSubstep,
  substepDurationsMs: GeneratingSubstepDurationsMs,
  run: () => Promise<T>,
  details?: { attempt?: number }
): Promise<T> {
  const startedAtMs = Date.now();

  logJobTimeline(jobId, "生成詳細開始", {
    substep,
    label: GENERATING_SUBSTEP_LABELS[substep],
    attempt: details?.attempt,
  });

  try {
    const result = await run();
    const durationMs = Date.now() - startedAtMs;
    substepDurationsMs[substep] = (substepDurationsMs[substep] ?? 0) + durationMs;

    logJobTimeline(jobId, "生成詳細完了", {
      substep,
      label: GENERATING_SUBSTEP_LABELS[substep],
      attempt: details?.attempt,
      duration: formatDurationMs(durationMs),
      total: formatDurationMs(substepDurationsMs[substep]),
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    substepDurationsMs[substep] = (substepDurationsMs[substep] ?? 0) + durationMs;

    logJobTimeline(jobId, "生成詳細失敗", {
      substep,
      label: GENERATING_SUBSTEP_LABELS[substep],
      attempt: details?.attempt,
      duration: formatDurationMs(durationMs),
      total: formatDurationMs(substepDurationsMs[substep]),
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

Deno.serve(async () => {
  try {
    // 環境変数の取得
    // SUPABASE_URLは自動的に利用可能（Supabaseが提供）
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    // SERVICE_ROLE_KEYは手動で設定する必要がある（SUPABASE_プレフィックスは使用不可）
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_STUDIO_API_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    // 環境変数のチェック（詳細なエラーメッセージを返す）
    // Provider 別 API key（GEMINI_API_KEY / OPENAI_API_KEY）はジョブのモデル判定後に
    // charging stage 前で検証するため、ここでは必須化しない。worker 全体の起動を
    // 片方の key 不在で止めないことで、もう一方の provider のジョブを処理できるようにする。
    if (!supabaseUrl) {
      console.error("Missing SUPABASE_URL environment variable");
      return new Response(
        JSON.stringify({ 
          error: "Missing environment variable: SUPABASE_URL",
          message: "SUPABASE_URL should be automatically provided by Supabase"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!serviceRoleKey) {
      console.error("Missing SERVICE_ROLE_KEY environment variable");
      return new Response(
        JSON.stringify({ 
          error: "Missing environment variable: SERVICE_ROLE_KEY",
          message: "Please set SERVICE_ROLE_KEY in Edge Function Secrets (not SUPABASE_SERVICE_ROLE_KEY)"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Supabaseクライアント初期化（サービスロールキー使用）
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // キューからのメッセージ取得
    // 注意: PostgRESTはpublicとgraphql_publicスキーマのみを許可するため、
    // pgmq_public.read()の代わりにpublic.pgmq_read()ラッパー関数を使用
    let messages;
    let readError;
    
    try {
      const result = await supabase
        .rpc("pgmq_read", {
          p_queue_name: QUEUE_NAME,
          p_vt: VISIBILITY_TIMEOUT,
          p_qty: MAX_MESSAGES,
        });
      
      messages = result.data;
      readError = result.error;
    } catch (err) {
      console.error("Exception while reading from queue:", err);
      return new Response(
        JSON.stringify({ 
          error: "Exception while reading from queue",
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (readError) {
      console.error("Failed to read from queue:", readError);
      return new Response(
        JSON.stringify({ 
          error: "Failed to read from queue",
          details: readError.message || String(readError),
          code: readError.code,
          hint: readError.hint,
          queueName: QUEUE_NAME
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!messages || messages.length === 0) {
      // メッセージがない場合は正常終了
      return new Response(
        JSON.stringify({ processed: 0, message: "No messages in queue" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let processedCount = 0;
    let skippedCount = 0;

    const updateJobProcessingStage = async (
      jobId: string,
      processingStage: "charging" | "generating" | "uploading" | "persisting",
      options?: {
        resultImageUrl?: string | null;
      }
    ) => {
      const nextUpdate: {
        processing_stage: "charging" | "generating" | "uploading" | "persisting";
        result_image_url?: string | null;
      } = {
        processing_stage: processingStage,
      };
      if (options && "resultImageUrl" in options) {
        nextUpdate.result_image_url = options.resultImageUrl ?? null;
      }

      const { error } = await supabase
        .from("image_jobs")
        .update(nextUpdate)
        .eq("id", jobId)
        .eq("status", "processing");

      if (error) {
        console.warn(
          `[Job Processing] Failed to update processing_stage to ${processingStage}:`,
          error
        );
      }
    };

    // 各メッセージを処理
    for (const message of messages) {
      const msgId = message.msg_id;
      const jobId = message.message?.job_id;

      if (!jobId) {
        console.error("Message missing job_id:", message);
        // メッセージを削除してスキップ
        await supabase.rpc("pgmq_delete", {
          p_queue_name: QUEUE_NAME,
          p_msg_id: msgId,
        });
            continue;
          }

      try {
        // ジョブのステータスを取得（冪等性チェック）
        const { data: job, error: jobError } = await supabase
          .from("image_jobs")
          .select("*")
          .eq("id", jobId)
          .single();

        if (jobError || !job) {
          console.error("Job not found:", jobId, jobError);
          // ジョブが見つからない場合はメッセージを削除
          await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });
          continue;
        }

        // 冪等性チェック: 終端状態のジョブはメッセージを削除してスキップ。
        //
        // failed も削除対象に含める。claim を queued 限定にしたため、failed の
        // メッセージが再配送されても UPDATE が 0 件になり、削除されないまま
        // 残り続ける。可視性タイムアウトごとに再取得され、取得枠を占有して
        // 新しい生成を飢餓状態にしうる。「failed 更新後・pgmq_delete 前に
        // クラッシュ」でも再現する。
        //
        // processing は削除しない。削除するとクラッシュ時にジョブが永続的に
        // processing のまま残る（下の stale 判定で回収する）。
        if (job.status === "succeeded" || job.status === "failed") {
          // failed の再配送は課金後処理の reconciliation として使う。
          // 「failed へ更新 → 返金 → pgmq_delete」の途中でクラッシュした場合、
          // ここで無条件に削除すると未実施の返金が永久に実行されない。
          if (job.status === "failed") {
            const terminalOneTapMetadata =
              job.generation_type === "one_tap_style"
                ? getOneTapStylePresetMetadata(job)
                : null;
            const settled = await settleFailedJobBillingWithSupabase(supabase, {
              jobId,
              job,
              errorMessage: job.error_message ?? "",
              isFreeOneTapStyleJob:
                job.generation_type === "one_tap_style" &&
                terminalOneTapMetadata?.billingMode === "free",
              reservedAttemptId:
                job.generation_type === "one_tap_style"
                  ? getOneTapStyleReservedAttemptId(job)
                  : null,
            });

            if (!settled) {
              // ack せずメッセージを残し、次の配送でもう一度試す
              console.warn(
                `[Job Processing] Left failed message for billing reconciliation: ${jobId}`,
              );
              skippedCount++;
              continue;
            }
          }

          const { error: terminalDeleteError } = await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });
          if (terminalDeleteError) {
            console.error(
              "Failed to delete terminal job message:",
              terminalDeleteError,
            );
          }
          skippedCount++;
          continue;
        }

        // processing中の場合は、スタック判定を行う
        if (job.status === "processing") {
          const startedAtMs = job.started_at ? new Date(job.started_at).getTime() : null;
          const nowMs = Date.now();
          const elapsedSeconds = startedAtMs ? Math.floor((nowMs - startedAtMs) / 1000) : Number.MAX_SAFE_INTEGER;
          const isStale = elapsedSeconds >= PROCESSING_STALE_TIMEOUT_SECONDS;

          if (!isStale) {
            // まだ他のワーカーが処理中の可能性があるため、メッセージは削除しない
            // （削除すると、クラッシュ時にジョブが永続的にprocessingになる）
            skippedCount++;
            continue;
          }

          // processingが長時間継続しているジョブは、通常の失敗判定フローに合流
          const newAttempts = (job.attempts || 0) + 1;
          const shouldMarkAsFailed = newAttempts >= 2;
          const staleErrorMessage = "処理がタイムアウトしました。入力画像サイズを下げて再試行してください。";
          const { data: staleUpdatedJob, error: staleUpdateError } = await supabase
            .from("image_jobs")
            .update({
              status: shouldMarkAsFailed ? "failed" : "queued",
              processing_stage: shouldMarkAsFailed ? "failed" : "queued",
              result_image_url: null,
              error_message: staleErrorMessage,
              attempts: newAttempts,
              started_at: shouldMarkAsFailed ? job.started_at : null,
              completed_at: shouldMarkAsFailed ? new Date().toISOString() : null,
            })
            .eq("id", jobId)
            .eq("status", "processing")
            .select("id")
            .maybeSingle();

          if (staleUpdateError) {
            console.error("Failed to mark stale processing job as failed:", staleUpdateError);
            // 更新できない場合はメッセージを削除しない（再試行）
            continue;
          }

          if (!staleUpdatedJob) {
            console.log(`[Job Processing] Stale update skipped because job state changed: ${jobId}`);
            skippedCount++;
            continue;
          }

          if (!shouldMarkAsFailed) {
            // 再試行可能なため、返金せずに次回ワーカー実行へ委譲
            skippedCount++;
            continue;
          }

          // 最終失敗確定時のみ返金または無料枠release。
          // 通常失敗・failed再配送と同じ共通処理を通し、課金後処理が
          // 完了したときだけメッセージを ack する。
          const staleOneTapStyleMetadata =
            job.generation_type === "one_tap_style"
              ? getOneTapStylePresetMetadata(job)
              : null;
          const staleReservedAttemptId =
            job.generation_type === "one_tap_style"
              ? getOneTapStyleReservedAttemptId(job)
              : null;

          const staleSettled = await settleFailedJobBillingWithSupabase(
            supabase,
            {
              jobId,
              job,
              errorMessage: staleErrorMessage,
              isFreeOneTapStyleJob:
                job.generation_type === "one_tap_style" &&
                staleOneTapStyleMetadata?.billingMode === "free",
              reservedAttemptId: staleReservedAttemptId,
            },
          );

          if (!staleSettled) {
            console.warn(
              `[Job Processing] Left stale-failed message for billing reconciliation: ${jobId}`,
            );
            skippedCount++;
            continue;
          }

          const { error: staleDeleteError } = await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });
          if (staleDeleteError) {
            console.error(
              "Failed to delete message after stale final failure:",
              staleDeleteError,
            );
          }
          skippedCount++;
          continue;
        }

        // ステータスを'processing'に更新（排他制御）
        const { data: processingJob, error: updateError } = await supabase
          .from("image_jobs")
          .update({
            status: "processing",
            processing_stage: "processing",
            result_image_url: null,
            started_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          // claim できるのは queued のみ (ADR-012)。
          // 以前は failed も含めていたが、終端 failed を暗黙に再実行する経路に
          // なっており、attempts の上限(2)を超えて再試行される不具合の温床だった
          // (本番実測: attempts=3 が 25 件)。内部リトライは status を queued に
          // 戻して行い、終端 failed は不変とする。ユーザーの再試行は新しい
          // ジョブ + 実行入力レコードを作る。
          .eq("status", "queued")
          .select("id")
          .maybeSingle();

        if (updateError) {
          console.error("Failed to update job status:", updateError);
          // 更新に失敗した場合は、次のメッセージを処理（可視性タイムアウト後に再処理される）
          continue;
        }

        if (!processingJob) {
          // 既に他ワーカーが状態を変更済み
          skippedCount++;
          continue;
        }

        const stageDurationsMs: StageDurationsMs = {};
        const createdAtMs =
          typeof job.created_at === "string"
            ? new Date(job.created_at).getTime()
            : null;
        const queueWaitMs =
          createdAtMs !== null && !Number.isNaN(createdAtMs)
            ? Math.max(Date.now() - createdAtMs, 0)
            : null;
        const workerStartedAtMs = Date.now();
        let currentStage: TimedProcessingStage | null = null;
        let generatedImagesTempReferencePathToCleanup: string | null = null;
        const dbModel = normalizeModelName(job.model);
        const apiModel = toApiModelName(dbModel);
        const backgroundMode = resolveBackgroundMode(job.background_mode, null);
        const oneTapStyleMetadata =
          job.generation_type === "one_tap_style"
            ? getOneTapStylePresetMetadata(job)
            : null;
        const reservedAttemptId =
          job.generation_type === "one_tap_style"
            ? getOneTapStyleReservedAttemptId(job)
            : null;
        const isFreeOneTapStyleJob =
          job.generation_type === "one_tap_style" &&
          oneTapStyleMetadata?.billingMode === "free";

        logJobTimeline(jobId, "ジョブ開始", {
          generationType: job.generation_type,
          model: dbModel,
          sourceImage: job.input_image_url ? "yes" : "no",
          queueWait: formatDurationMs(queueWaitMs),
        });

        // ===== Provider 別 API key 検証（charging 前・再試行不可） =====
        const requiresOpenAIKey = isOpenAIImageModel(dbModel);
        if (!requiresOpenAIKey && !GEMINI_GENERATION_ENABLED) {
          const disabledMessage = `${GEMINI_PROVIDER_ERROR}: ${GEMINI_DISABLED_MESSAGE}`;
          console.warn("[Job Processing] Gemini generation is disabled", {
            jobId,
            model: dbModel,
          });
          await supabase
            .from("image_jobs")
            .update({
              status: "failed",
              processing_stage: "failed",
              result_image_url: null,
              error_message: disabledMessage,
              completed_at: new Date().toISOString(),
            })
            .eq("id", jobId)
            .eq("status", "processing");
          await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });
          skippedCount++;
          continue;
        }
        const missingProviderKey = requiresOpenAIKey
          ? !openaiApiKey
          : !geminiApiKey;
        if (missingProviderKey) {
          const missingKeyMessage = requiresOpenAIKey
            ? "OPENAI_API_KEY is not configured in Edge Function Secrets"
            : "GEMINI_API_KEY is not configured in Edge Function Secrets";
          console.error("[Job Processing] Missing provider API key", {
            jobId,
            model: dbModel,
            requiresOpenAIKey,
          });
          await supabase
            .from("image_jobs")
            .update({
              status: "failed",
              processing_stage: "failed",
              result_image_url: null,
              error_message: missingKeyMessage,
              completed_at: new Date().toISOString(),
            })
            .eq("id", jobId)
            .eq("status", "processing");
          await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });
          skippedCount++;
          continue;
        }

        // ===== 生成入力の解決と派生生成の認可（減算より前に実行） =====
        //
        // ペルコイン減算より前に行う。ここで落ちる原因は「実行入力レコードの
        // 欠落」と「原作が利用できない」のどちらもユーザーの操作では直せない。
        // 減算してから失敗させると、成功しないことが確定している生成に対して
        // 一度残高を減らし、返金経路の成否に残高の正しさを賭けることになる。
        // 先に検証すれば、そもそも減算・返金のどちらも発生しない。
        //
        // 生成フェーズと画像永続化フェーズの両方から参照するため、
        // どちらのコールバックよりも外側で保持する。
        let promptExecution: PromptExecutionRecord | null = null;
        const isDerivedJob = job.origin_post_id != null;
        let generationInput = "";
        try {
          // 生成入力の解決 (プロンプト秘匿境界)
          //
          // 本文は service-only の generation_prompt_snapshots にだけ存在する。
          // image_jobs.prompt_text は常に空で、legacy 列へのフォールバックは
          // 持たない (fail closed)。落ちる経路を残すと、レコードの作成漏れが
          // 「古い列の値で生成が通ってしまう」形で隠蔽され、Phase 0C の空化後に
          // 初めて壊れる。
          //
          // 生成種別ごとに必要な入力が揃っていなければ、provider を呼ぶ前に
          // 固定内部コードで終端失敗させる。
          promptExecution = await resolvePromptExecutionInput(
            supabase,
            job.id,
          );
          // coordinate / free は生入力、one_tap_style は組み立て済み全文。
          // どちらも無い種別 (inspire / creator_looks) はジョブの列から作る。
          // 派生生成は本文を実行入力に持たない。原作者の入力を
          // provider 送信直前に author secret から解決する（REQ-007a）。
          //
          // ここでは本文を取らず、認可だけを見る。
          if (isDerivedJob) {
            if (promptExecution?.snapshotKind !== "derived_reference") {
              // 派生 job に materialized record が付いている状態は改ざんの疑い。
              // DB の cross-table trigger でも拒否されるが、ここでも止める。
              throw new Error(GENERATION_PROMPT_EXECUTION_MISSING);
            }

            const { data: preChargeValidation, error: preChargeError } =
              await supabase
                .rpc("validate_derived_prompt_source", {
                  p_source_post_id: job.origin_post_id,
                  p_requester_id: job.user_id,
                })
                .select("is_available")
                .maybeSingle();

            if (preChargeError) {
              // 検証できないときは通さない (fail closed)
              throw new Error(DERIVED_PROMPT_SOURCE_UNAVAILABLE);
            }

            if (
              !(preChargeValidation as { is_available?: boolean } | null)
                ?.is_available
            ) {
              throw new Error(DERIVED_PROMPT_SOURCE_UNAVAILABLE);
            }
          }

          // 派生生成の本文は provider 送信直前に解決するため、ここでは空。
          generationInput = isDerivedJob
            ? ""
            : promptExecution?.authorInput ??
              promptExecution?.providerPrompt ??
              "";

          if (!isDerivedJob) {
            const requiresAuthorInput =
              job.generation_type === "coordinate" ||
              job.generation_type === "free";
            const requiresProviderPrompt =
              job.generation_type === "one_tap_style";

            if (
              (requiresAuthorInput && !promptExecution?.authorInput) ||
              (requiresProviderPrompt && !promptExecution?.providerPrompt)
            ) {
              throw new Error(GENERATION_PROMPT_EXECUTION_MISSING);
            }
          }
        } catch (preflightError) {
          const preflightMessage = sanitizeProviderErrorMessage(
            preflightError instanceof Error
              ? preflightError.message
              : "Unknown error",
          );
          console.error("[Job Processing] Preflight failed", {
            jobId,
            message: preflightMessage,
          });
          const preflightFailedAtMs = Date.now();
          logJobTimingSummary({
            jobId,
            outcome: "ジョブ失敗",
            queueWaitMs,
            workerDurationMs: Math.max(preflightFailedAtMs - workerStartedAtMs, 0),
            totalDurationMs:
              createdAtMs !== null && !Number.isNaN(createdAtMs)
                ? Math.max(preflightFailedAtMs - createdAtMs, 0)
                : null,
            stageDurationsMs,
            currentStage,
            errorMessage: preflightMessage,
          });

          // 生成フェーズの失敗と同じ再試行判定を使う。
          // 実行入力の欠落と原作の利用不可は固定内部コードで終端失敗するが、
          // snapshot 読み出しの一時的なDBエラーは1回だけ再試行させる。
          // ここで常に failed にすると、接続の瞬断が永久失敗になる。
          const { data: preflightCurrentJob, error: preflightFetchError } =
            await supabase
              .from("image_jobs")
              .select("attempts, started_at")
              .eq("id", jobId)
              .single();

          if (preflightFetchError) {
            console.error(
              "Failed to fetch job attempts after preflight failure:",
              preflightFetchError,
            );
            // ack しない。可視性タイムアウト後に再処理される。
            continue;
          }

          const preflightAttempts = (preflightCurrentJob?.attempts || 0) + 1;
          const preflightIsFinal =
            isNonRetriableGenerationError(preflightMessage) ||
            preflightAttempts >= 2;

          const { data: preflightUpdatedJob, error: preflightUpdateError } =
            await supabase
              .from("image_jobs")
              .update({
                status: preflightIsFinal ? "failed" : "queued",
                processing_stage: preflightIsFinal ? "failed" : "queued",
                result_image_url: null,
                error_message: preflightMessage,
                attempts: preflightAttempts,
                started_at: preflightIsFinal
                  ? preflightCurrentJob?.started_at ?? job.started_at
                  : null,
                completed_at: preflightIsFinal
                  ? new Date().toISOString()
                  : null,
              })
              .eq("id", jobId)
              .eq("status", "processing")
              .select("id")
              .maybeSingle();

          if (preflightUpdateError) {
            console.error(
              "Failed to update job status after preflight failure:",
              preflightUpdateError,
            );
            continue;
          }

          if (!preflightUpdatedJob) {
            skippedCount++;
            continue;
          }

          if (!preflightIsFinal) {
            // queued へ戻した。減算していないので返金も不要。
            // ack しないことで可視性タイムアウト後に再配送される。
            continue;
          }

          // 減算前なので返金は発生しないが、無料枠の予約は解放する必要がある。
          // settleFailedJobBilling は冪等で、消費履歴が無ければ返金しない。
          const preflightSettled = await settleFailedJobBillingWithSupabase(
            supabase,
            {
              jobId,
              job,
              errorMessage: preflightMessage,
              isFreeOneTapStyleJob,
              reservedAttemptId,
            },
          );

          if (preflightSettled) {
            await supabase.rpc("pgmq_delete", {
              p_queue_name: QUEUE_NAME,
              p_msg_id: msgId,
            });
          } else {
            // ack しない。再配送で冒頭の failed 分岐が reconciliation する。
            console.warn(
              `[Job Processing] Left message for billing reconciliation: ${jobId}`,
            );
          }

          continue;
        }


        // ===== ペルコイン減算処理（画像生成前に実行） =====
        if (!isFreeOneTapStyleJob) {
          currentStage = "charging";
          try {
            await measureJobStage(
              jobId,
              "charging",
              stageDurationsMs,
              async () => {
                await updateJobProcessingStage(jobId, "charging");
                const percoinCost = getGenerationPercoinAmount(job);
                await deductPercoinsFromGeneration(
                  supabase,
                  job.user_id,
                  jobId, // 一時的にjobIdを使用（画像生成後にgenerated_images.idに更新）
                  percoinCost
                );
              }
            );
          } catch (deductError) {
            // ペルコイン減算失敗時はジョブを失敗としてマーク
            console.error("[Job Processing] Failed to deduct percoins:", deductError);
            const failedAtMs = Date.now();
            const totalDurationMs =
              createdAtMs !== null && !Number.isNaN(createdAtMs)
                ? Math.max(failedAtMs - createdAtMs, 0)
                : null;
            logJobTimingSummary({
              jobId,
              outcome: "ジョブ失敗",
              queueWaitMs,
              workerDurationMs: Math.max(failedAtMs - workerStartedAtMs, 0),
              totalDurationMs,
              stageDurationsMs,
              currentStage,
              errorMessage:
                deductError instanceof Error
                  ? deductError.message
                  : String(deductError),
            });
            const { data: deductionFailedJob, error: deductionFailUpdateError } = await supabase
              .from("image_jobs")
              .update({
                status: "failed",
                processing_stage: "failed",
                result_image_url: null,
                error_message: `ペルコイン減算に失敗しました: ${deductError instanceof Error ? deductError.message : String(deductError)}`,
                completed_at: new Date().toISOString(),
              })
              .eq("id", jobId)
              .eq("status", "processing")
              .select("id")
              .maybeSingle();

            if (deductionFailUpdateError) {
              console.error("Failed to update job status after deduction failure:", deductionFailUpdateError);
              continue;
            }

            if (!deductionFailedJob) {
              skippedCount++;
              continue;
            }

            // メッセージを削除
            await supabase.rpc("pgmq_delete", {
              p_queue_name: QUEUE_NAME,
              p_msg_id: msgId,
            });

            continue; // 次のメッセージを処理
          }
        }

        // ===== フェーズ4-1: Gemini API呼び出しの実装 =====
        const geminiAttempts: GeminiAttemptMetadata[] = [];
        try {
          let generatedImages: GeneratedImageResult[] = [];
          if (isDerivedJob) {
            // 認可を再検証したうえで原作者の入力を取得する（REQ-007a）。
            //
            // validate と resolve を分けず、resolve 側が同一 statement で
            // 認可を再確認する。分けるとその間に条件が変わる余地ができる。
            //
            // ここで得た本文はメモリ上だけに置く。derived reference、job、
            // 生成画像、ログ、APM へは書かない。
            const { data: resolved, error: resolveError } = await supabase
              .rpc("resolve_derived_prompt_source", {
                p_source_post_id: job.origin_post_id,
                p_requester_id: job.user_id,
              })
              .select("author_input")
              .maybeSingle();

            if (resolveError) {
              // error object を丸ごと serialize しない。本文は含まれない想定だが、
              // RPC payload ごとログへ出す経路を作らない（REQ-017a）。
              console.error("[Job Processing] Derived prompt resolve failed", {
                jobId,
                code: resolveError.code,
              });
              throw new Error(DERIVED_PROMPT_SOURCE_UNAVAILABLE);
            }

            const resolvedInput = (resolved as { author_input?: string } | null)
              ?.author_input;

            if (!resolvedInput) {
              throw new Error(DERIVED_PROMPT_SOURCE_UNAVAILABLE);
            }

            generationInput = resolvedInput;
          }

          currentStage = "generating";
          await measureJobStage(
            jobId,
            "generating",
            stageDurationsMs,
            async () => {
              await updateJobProcessingStage(jobId, "generating");
              const generatingSubstepDurationsMs: GeneratingSubstepDurationsMs = {};
              // OpenAI 経路で再利用するため、inputPreparation 内で取得した入力画像を
              // 外側スコープに保持する（Gemini 経路でも parts に inline_data として使うのは同じ）
              let resolvedInputImageData: InputImageData | null = null;
              // image_1 (二枚目): Inspire のスタイルテンプレ、または One-Tap Style dual モードの参考画像。
              // OpenAI 多入力経路と Gemini parts の両方で再利用する。
              let resolvedInspireTemplateImage: InputImageData | null = null;
              const requestBody = await measureGeneratingSubstep(
                jobId,
                "inputPreparation",
                generatingSubstepDurationsMs,
                async () => {
                  const parts: Array<{
                    text?: string;
                    inline_data?: {
                      mime_type: string;
                      data: string;
                    };
                  }> = [];

                  if (job.input_image_url) {
                    let inputImageData: InputImageData;

                    if (job.input_image_url.startsWith("data:")) {
                      const imageData = extractBase64FromDataUrl(job.input_image_url);
                      if (!imageData) {
                        throw new Error("Invalid input image data URL");
                      }
                      inputImageData = {
                        base64: imageData.base64,
                        mimeType: imageData.mimeType,
                      };
                    } else {
                      try {
                        inputImageData = await downloadInputImageFromUrlWithRetry(job.input_image_url);
                      } catch (urlError) {
                        const urlErrorMessage = urlError instanceof Error
                          ? urlError.message
                          : String(urlError);
                        console.warn("[Input Image] URL download failed", {
                          jobId,
                          inputImageUrl: job.input_image_url,
                          sourceImageStockId: job.source_image_stock_id,
                          error: urlErrorMessage,
                        });

                        try {
                          inputImageData = await downloadInputImageViaStorageFallback(
                            supabase,
                            job.input_image_url
                          );
                          console.log("[Input Image] URL-derived storage fallback succeeded", {
                            jobId,
                            inputImageUrl: job.input_image_url,
                          });
                        } catch (fallbackError) {
                          const fallbackErrorMessage = fallbackError instanceof Error
                            ? fallbackError.message
                            : String(fallbackError);
                          console.warn("[Input Image] URL-derived storage fallback failed", {
                            jobId,
                            inputImageUrl: job.input_image_url,
                            sourceImageStockId: job.source_image_stock_id,
                            error: fallbackErrorMessage,
                          });

                          if (job.source_image_stock_id) {
                            try {
                              inputImageData = await downloadInputImageViaStockFallback(
                                supabase,
                                job.source_image_stock_id
                              );
                              console.log("[Input Image] Stock fallback download succeeded", {
                                jobId,
                                sourceImageStockId: job.source_image_stock_id,
                              });
                            } catch (stockFallbackError) {
                              const stockFallbackErrorMessage = stockFallbackError instanceof Error
                                ? stockFallbackError.message
                                : String(stockFallbackError);
                              throw new Error(
                                `Failed to download input image. URL: ${urlErrorMessage}; url_fallback: ${fallbackErrorMessage}; stock_fallback: ${stockFallbackErrorMessage}`
                              );
                            }
                          } else {
                            throw new Error(
                              `Failed to download input image. URL: ${urlErrorMessage}; url_fallback: ${fallbackErrorMessage}; stock_fallback: skipped(no source_image_stock_id)`
                            );
                          }
                        }
                      }
                    }

                    resolvedInputImageData = inputImageData;
                    parts.push({
                      inline_data: {
                        mime_type: inputImageData.mimeType,
                        data: inputImageData.base64,
                      },
                    });
                  }

                  // ===== image_1 取得 =====
                  // image_0 = ユーザーキャラ（既に push 済）
                  // image_1 = (a) Inspire のスタイルテンプレ画像 (style-templates bucket)
                  //          (b) One-Tap Style dual モード preset の参考画像 (style_presets bucket)
                  if (job.generation_type === "inspire") {
                    const templatePath = job.style_reference_image_url as
                      | string
                      | null;
                    if (!templatePath) {
                      throw new Error(
                        "Inspire job missing style_reference_image_url"
                      );
                    }
                    const inspireTemplateImageData =
                      await downloadStyleTemplateImage(supabase, templatePath);
                    resolvedInspireTemplateImage = inspireTemplateImageData;
                    parts.push({
                      inline_data: {
                        mime_type: inspireTemplateImageData.mimeType,
                        data: inspireTemplateImageData.base64,
                      },
                    });
                  } else if (job.generation_type === "one_tap_style") {
                    // image_1 取得: bucket は image_jobs.style_reference_image_bucket の
                    // 明示値で決定 (NULL は 'style_presets' fallback)。ADR-005 参照。
                    const location = resolveStyleReferenceImageLocation(
                      job as {
                        style_reference_image_url?: string | null;
                        style_reference_image_bucket?: string | null;
                      },
                    );
                    if (location) {
                      let referenceImageData: InputImageData;
                      if (location.bucket === "generated-images") {
                        referenceImageData =
                          await downloadGeneratedImagesTempReferenceImage(
                            supabase,
                            location.path,
                          );
                        generatedImagesTempReferencePathToCleanup = location.path;
                      } else {
                        referenceImageData = await downloadStylePresetReferenceImage(
                          supabase,
                          location.path,
                        );
                      }
                      resolvedInspireTemplateImage = referenceImageData;
                      parts.push({
                        inline_data: {
                          mime_type: referenceImageData.mimeType,
                          data: referenceImageData.base64,
                        },
                      });
                    }
                  }

                  // 全 prompt_key を 1 クエリで取得 (invocation 内メモリキャッシュ付き)
                  // → admin が編集した override があれば適用、無ければ registry default
                  const promptTemplates =
                    await resolveAllPromptTemplatesForWorker(supabase);

                  // Creator Looks 投稿か検出 → 検出時は user_style_template_secrets から
                  // hidden_prompt を取得して inspire の buildInspirePrompt を上書きする。
                  // (= ADR-001 / REQ-008、計画書 Phase 4 Worker 改修)
                  let creatorLooksHiddenPrompt: string | null = null;
                  if (
                    job.generation_type === "inspire" &&
                    job.style_template_id
                  ) {
                    const { data: templateRow } = await supabase
                      .from("user_style_templates")
                      .select("is_creator_looks")
                      .eq("id", job.style_template_id)
                      .maybeSingle();
                    if (templateRow?.is_creator_looks === true) {
                      const { data: secretRow } = await supabase
                        .from("user_style_template_secrets")
                        .select("hidden_prompt")
                        .eq("template_id", job.style_template_id)
                        .maybeSingle();
                      if (
                        secretRow &&
                        typeof secretRow.hidden_prompt === "string" &&
                        secretRow.hidden_prompt.length > 0
                      ) {
                        creatorLooksHiddenPrompt = secretRow.hidden_prompt;
                      } else {
                        // hidden_prompt 未生成: API 層で 422 で弾いている想定だが
                        // race condition で worker まで来た場合のフェイルセーフ
                        throw new Error(
                          "CREATOR_LOOKS_HIDDEN_PROMPT_NOT_READY",
                        );
                      }
                    }
                  }

                  let fullPrompt = generationInput;
                  if (job.generation_type === "one_tap_style") {
                    fullPrompt = generationInput;
                  } else if (creatorLooksHiddenPrompt) {
                    fullPrompt = composeCreatorLooksPrompt(
                      creatorLooksHiddenPrompt,
                      job.override_background ?? true,
                      // admin 編集可のカメラ/構図固定ルール(creator_looks.camera_directive)。
                      // promptTemplates は default + override をマージ済みなので必ず存在する。
                      promptTemplates["creator_looks.camera_directive"] ?? "",
                    );
                  } else if (job.generation_type === "inspire") {
                    fullPrompt = buildInspirePrompt({
                      // 新仕様: 4 bool カラム。inspire ジョブは migration で必ず値が入る。
                      // 万一 NULL の場合は「すべて維持」で fallback する。
                      overrides: {
                        outfit: job.override_outfit ?? true,
                        angle: job.override_angle ?? true,
                        pose: job.override_pose ?? true,
                        background: job.override_background ?? true,
                      },
                      templates: promptTemplates,
                    });
                  } else if (job.input_image_url) {
                    fullPrompt = buildSharedPrompt({
                      generationType: job.generation_type as GenerationType,
                      outfitDescription: generationInput,
                      backgroundMode,
                      sourceImageType:
                        job.source_image_type === "real"
                          ? "real"
                          : "illustration",
                      templates: promptTemplates,
                      // framing_mode: 既定 free_pose / 「維持」で locked。全ログインユーザー対象。
                      // metadata にキーが無い既存ジョブは locked = 現行挙動。
                      framingMode: getFramingModeFromGenerationMetadata(
                        job.generation_metadata,
                      ),
                    });
                  }

                  // === Creator Looks 生成モード処理(方式A) ===
                  // outfit_and_background: 段階1(衣装着せ・背景維持)を先に生成し、その出力を
                  //   image_0 に差し替え image_1 を外して、本体生成を段階2(背景変更)にする。
                  // background_only: image_1 を渡さず、image_0 の衣装を保ったまま背景だけ変える。
                  // outfit_only: 既存どおり(composeCreatorLooksPrompt で背景維持・衣装着せ)。
                  if (creatorLooksHiddenPrompt && resolvedInputImageData) {
                    const clMode =
                      getCreatorLooksModeFromGenerationMetadata(
                        job.generation_metadata,
                      ) ??
                      creatorLooksModeFromOverrides(
                        job.override_outfit ?? true,
                        job.override_background ?? true,
                      );
                    if (
                      clMode === "background_only" &&
                      resolvedInspireTemplateImage
                    ) {
                      const image1Base64 = resolvedInspireTemplateImage.base64;
                      const idx = parts.findIndex(
                        (p) => p.inline_data?.data === image1Base64,
                      );
                      if (idx >= 0) parts.splice(idx, 1);
                      resolvedInspireTemplateImage = null;
                      fullPrompt = composeBackgroundStagePrompt(
                        creatorLooksHiddenPrompt,
                        promptTemplates["creator_looks.background_directive"] ?? "",
                      );
                    } else if (
                      clMode === "outfit_and_background" &&
                      resolvedInspireTemplateImage
                    ) {
                      // 段階1: 衣装着せ(image_0 + image_1, 背景維持)
                      const cameraDirective =
                        promptTemplates["creator_looks.camera_directive"] ?? "";
                      const stage1 = await generateCreatorLooksOutfitStage({
                        dbModel,
                        apiModel,
                        geminiApiKey: geminiApiKey ?? "",
                        image0: resolvedInputImageData,
                        image1: resolvedInspireTemplateImage,
                        prompt: composeCreatorLooksPrompt(
                          creatorLooksHiddenPrompt,
                          false,
                          cameraDirective,
                        ),
                      });
                      // 段階2用に差し替え: image_0=段階1出力 / image_1なし / 背景プロンプト
                      resolvedInputImageData = stage1;
                      resolvedInspireTemplateImage = null;
                      fullPrompt = composeBackgroundStagePrompt(
                        creatorLooksHiddenPrompt,
                        promptTemplates["creator_looks.background_directive"] ?? "",
                      );
                      parts.length = 0;
                      parts.push({
                        inline_data: {
                          mime_type: stage1.mimeType,
                          data: stage1.base64,
                        },
                      });
                    }
                  }

                  parts.push({
                    text: fullPrompt,
                  });

                  const nextRequestBody: {
                    contents: Array<{
                      parts: typeof parts;
                    }>;
                    safetySettings: Array<{
                      category:
                        | "HARM_CATEGORY_HARASSMENT"
                        | "HARM_CATEGORY_HATE_SPEECH"
                        | "HARM_CATEGORY_SEXUALLY_EXPLICIT"
                        | "HARM_CATEGORY_DANGEROUS_CONTENT";
                      threshold: "BLOCK_ONLY_HIGH" | "BLOCK_NONE";
                    }>;
                    generationConfig?: {
                      candidateCount?: number;
                      responseModalities?: Array<"TEXT" | "IMAGE">;
                      imageConfig?: {
                        imageSize?: GeminiImageSize;
                        aspectRatio?: GeminiAspectRatio;
                      };
                    };
                  } = {
                    contents: [
                      {
                        parts,
                      },
                    ],
                    safetySettings: [
                      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
                      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
                      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
                    ],
                  };

                  const imageSize = extractImageSize(dbModel);

                  // `gemini-3.1-flash-image-preview` は imageSize 必須 (既存仕様)。
                  if (apiModel === "gemini-3.1-flash-image-preview" && !imageSize) {
                    throw new Error(`Unsupported image size for model: ${dbModel}`);
                  }

                  // === 出力アスペクト比の決定 ===
                  // Inspire (複数入力) のときは OpenAI と同じ基準画像選択を使う:
                  // - すべて維持 (4 つ true) → image_1 (スタイルテンプレ) 基準
                  // - 部分上書き                  → image_0 (ユーザーキャラ) 基準
                  // 単一入力経路では image_0 (= resolvedInputImageData) を使う。
                  const isInspireGemini =
                    job.generation_type === "inspire" &&
                    resolvedInspireTemplateImage !== null;
                  let aspectBaseImage: InputImageData | null =
                    resolvedInputImageData;
                  if (isInspireGemini) {
                    const inspireBaseIndex = resolveInspireTargetSizeBaseIndex({
                      outfit: job.override_outfit ?? true,
                      angle: job.override_angle ?? true,
                      pose: job.override_pose ?? true,
                      background: job.override_background ?? true,
                    });
                    if (inspireBaseIndex === 1) {
                      aspectBaseImage = resolvedInspireTemplateImage;
                    }
                  }
                  const aspectDims = aspectBaseImage
                    ? parseImageDimensions(
                        decodeBase64(aspectBaseImage.base64),
                        aspectBaseImage.mimeType,
                      )
                    : null;
                  // 出力比率は生成種別で決まる(job-output-aspect の pure helper に集約):
                  // - one_tap_style: preset の outputAspectRatioMode(source/preset_image/明示)
                  // - free: generation_metadata.outputAspectRatioMode(source + 明示9比率)
                  // - それ以外(coordinate / inspire 等): 入力比率に自動スナップ
                  const aspectRatio: GeminiAspectRatio = resolveJobOutputAspectRatio({
                    generationType: job.generation_type,
                    generationMetadata: job.generation_metadata as
                      | Record<string, unknown>
                      | null,
                    oneTapStyleMetadata,
                    inputDimensions: aspectDims,
                  }).label;

                  // gemini-3.1-flash-image-preview のみ candidateCount / responseModalities を追加。
                  // gemini-3-pro-image-preview / gemini-2.5-flash-image 等は不要。
                  const requiresResponseModalities =
                    apiModel === "gemini-3.1-flash-image-preview";

                  // gemini-3-pro-image-preview は imageSize がある場合のみ送信 (既存仕様維持)。
                  // それ以外のモデル (gemini-2.5-flash-image 等) でも `imageConfig.aspectRatio`
                  // は必ず付与し、出力アスペクトをクランプ範囲に収める。
                  const finalImageSize: GeminiImageSize | null =
                    apiModel === "gemini-3.1-flash-image-preview" ||
                    apiModel === "gemini-3-pro-image-preview"
                      ? imageSize
                      : null;

                  nextRequestBody.generationConfig = {
                    ...nextRequestBody.generationConfig,
                    ...buildGeminiGenerationConfig({
                      imageSize: finalImageSize,
                      aspectRatio,
                      requiresResponseModalities,
                    }),
                  };

                  return nextRequestBody;
                }
              );

              const basePromptText =
                requestBody.contents[0]?.parts.find((part) => typeof part.text === "string")
                  ?.text ?? "";

              if (isOpenAIImageModel(dbModel)) {
                // ===== OpenAI 経路 =====
                if (!resolvedInputImageData) {
                  // coordinate 系は schema で input image 必須化済みだが念のため
                  throw new Error("OpenAI gpt-image-2 requires an input image");
                }
                const openAIInputImage = resolvedInputImageData;
                // image_1 を多入力で渡すケース:
                //   - Inspire (style template)
                //   - One-Tap Style dual モード preset (admin 登録の参考画像)
                const isInspireOpenAI =
                  (job.generation_type === "inspire" ||
                    job.generation_type === "one_tap_style") &&
                  resolvedInspireTemplateImage !== null;
                const gptImage2 = parseGptImage2Model(dbModel);
                if (!gptImage2) {
                  throw new Error(`Invalid GPT Image 2 model: ${dbModel}`);
                }
                const openAIRequestTimeoutMs =
                  resolveOpenAIRequestTimeoutMs(gptImage2);
                // 出力比率(job-output-aspect の pure helper に集約)。明示比率のときだけ
                // OpenAI の targetSize を上書きし、source / 非対象は undefined にして
                // 入力画像ベース(resolveOpenAITargetSize=従来挙動)へ委ねる。
                // - one_tap_style: 明示比率 / 寸法ありの preset_image を上書き
                // - free: generation_metadata の明示9比率を上書き(source は委ねる)
                // GPT Image 2 も 9:16〜16:9 を出力可能(16px 丸めのため厳密比率でなく近似)。
                const targetSize = resolveOpenAIOutputTargetSize({
                  generationType: job.generation_type,
                  generationMetadata: job.generation_metadata as
                    | Record<string, unknown>
                    | null,
                  oneTapStyleMetadata,
                  inputDimensions: null,
                  sizeTier: gptImage2.sizeTier,
                });
                const attemptStartedAtMs = Date.now();
                let attemptHttpStatus: number | null = null;
                let attemptHttpOk = false;
                let attemptTimedOut = false;
                let attemptErrorMessage: string | null = null;
                try {
                  // OpenAI 経路は provider 中立な substep 名を使用し、
                  // 運用ログ・タイムラインで Gemini 経路と区別できるようにする。
                  const results = await measureGeneratingSubstep(
                    jobId,
                    "providerRequest",
                    generatingSubstepDurationsMs,
                    () =>
                      isInspireOpenAI && resolvedInspireTemplateImage
                        ? callOpenAIImageEditMultiInputBatch({
                            prompt: basePromptText,
                            inputImages: [
                              openAIInputImage,
                              resolvedInspireTemplateImage,
                            ],
                            // 出力フレームの起点画像はジョブ種別で決まる:
                            //   - Inspire (override_* 4 bool あり):
                            //       すべて維持 (4 つ true) → image_1 基準
                            //       部分上書き (1 つ以上 false) → image_0 基準
                            //   - One-Tap Style dual: image_0 (ユーザーキャラ) を編集する設計
                            //     なので常に 0 (image_0 基準)
                            // プロンプト側のフレーミング指示と一致させる。
                            targetSizeBaseIndex:
                              job.generation_type === "inspire"
                                ? resolveInspireTargetSizeBaseIndex({
                                    outfit: job.override_outfit ?? true,
                                    angle: job.override_angle ?? true,
                                    pose: job.override_pose ?? true,
                                    background: job.override_background ?? true,
                                  })
                                : 0,
                            targetSize,
                            timeoutMs: openAIRequestTimeoutMs,
                            quality: gptImage2.quality,
                            sizeTier: gptImage2.sizeTier,
                            n: 1,
                          })
                        : callOpenAIImageEditBatch({
                            prompt: basePromptText,
                            inputImage: openAIInputImage,
                            timeoutMs: openAIRequestTimeoutMs,
                            quality: gptImage2.quality,
                            sizeTier: gptImage2.sizeTier,
                            targetSize,
                            n: 1,
                          }),
                    { attempt: 1 }
                  );
                  attemptHttpOk = true;
                  attemptHttpStatus = 200;
                  generatedImages = results;
                  geminiAttempts.push({
                    attempt: 1,
                    startedAt: new Date(attemptStartedAtMs).toISOString(),
                    durationMs: Date.now() - attemptStartedAtMs,
                    httpStatus: attemptHttpStatus,
                    httpOk: attemptHttpOk,
                    finishReasons: [],
                    hasImage: results.length === 1,
                    timedOut: false,
                    errorMessage: null,
                    reinforcementApplied: false,
                  });
                } catch (openAIError) {
                  attemptErrorMessage =
                    openAIError instanceof Error
                      ? openAIError.message
                      : String(openAIError);
                  if (
                    openAIError instanceof Error &&
                    (openAIError.name === "AbortError" ||
                      /aborted/i.test(attemptErrorMessage))
                  ) {
                    attemptTimedOut = true;
                    attemptErrorMessage = `OpenAI request timed out after ${openAIRequestTimeoutMs}ms`;
                  }
                  geminiAttempts.push({
                    attempt: 1,
                    startedAt: new Date(attemptStartedAtMs).toISOString(),
                    durationMs: Date.now() - attemptStartedAtMs,
                    httpStatus: attemptHttpStatus,
                    httpOk: attemptHttpOk,
                    finishReasons: [],
                    hasImage: false,
                    timedOut: attemptTimedOut,
                    errorMessage: attemptErrorMessage,
                    reinforcementApplied: false,
                  });
                  throw openAIError;
                }

                logJobTimeline(jobId, "生成詳細サマリ", {
                  steps: buildGeneratingSubstepSummary(generatingSubstepDurationsMs),
                });

                if (generatedImages.length === 0) {
                  throw new Error("No images generated");
                }
                return;
              }

              // ===== Gemini 経路 =====
              // provider 別 env key 検証は charging 前に実施済みのため、ここでは必ず存在する
              const geminiApiKeyResolved = geminiApiKey ?? "";
              const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent`;
              const maxAttempts = 2;
              const isOneTapStyle = job.generation_type === "one_tap_style";
              const isCoordinate = job.generation_type === "coordinate";

              // リトライ強化 prefix にも admin override を反映する
              // (templates dict は既に resolveAllPromptTemplatesForWorker で取得済み —
              //  invocation 内メモリキャッシュにより 2 回目以降は DB 取得なし)
              const reinforcementTemplates =
                await resolveAllPromptTemplatesForWorker(supabase);
              // free_pose ジョブはフレーム固定を再強制しない reinforcement 変種を使う
              // (locked 用文言の「Do not extend the crop」が free_pose prefix と矛盾するため)
              const reinforcementFramingMode = getFramingModeFromGenerationMetadata(
                job.generation_metadata,
              );
              for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                const reinforcementPrefix = isOneTapStyle
                  ? buildStyleAttemptReinforcementPrefix(
                      attempt,
                      reinforcementTemplates,
                      reinforcementFramingMode,
                    )
                  : isCoordinate
                    ? buildCoordinateAttemptReinforcementPrefix(
                        attempt,
                        reinforcementTemplates,
                        reinforcementFramingMode,
                      )
                    : "";
                const reinforcementApplied = reinforcementPrefix.length > 0;

                const attemptParts = requestBody.contents[0].parts.map((part) => {
                  if (typeof part.text === "string") {
                    return {
                      ...part,
                      text: reinforcementApplied
                        ? `${reinforcementPrefix}${basePromptText}`
                        : part.text,
                    };
                  }
                  return part;
                });

                const attemptRequestBody = {
                  ...requestBody,
                  contents: [
                    {
                      ...requestBody.contents[0],
                      parts: attemptParts,
                    },
                  ],
                };

                const attemptStartedAtMs = Date.now();
                let attemptHttpStatus: number | null = null;
                let attemptHttpOk = false;
                let attemptTimedOut = false;
                let attemptErrorMessage: string | null = null;
                let geminiData: GeminiResponse | null = null;

                try {
                  geminiData = await measureGeneratingSubstep(
                    jobId,
                    "geminiRequest",
                    generatingSubstepDurationsMs,
                    async () => {
                      const geminiTimeoutMs =
                        resolveGeminiRequestTimeoutMs(dbModel);
                      const abortController = new AbortController();
                      const timeoutId = setTimeout(
                        () => abortController.abort(),
                        geminiTimeoutMs
                      );
                      try {
                        const geminiResponse = await fetch(apiUrl, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "x-goog-api-key": geminiApiKeyResolved,
                          },
                          body: JSON.stringify(attemptRequestBody),
                          signal: abortController.signal,
                        });

                        attemptHttpStatus = geminiResponse.status;
                        attemptHttpOk = geminiResponse.ok;

                        if (!geminiResponse.ok) {
                          const errorData = await geminiResponse
                            .json()
                            .catch(() => null);
                          const geminiErrorMessage =
                            typeof errorData?.error?.message === "string"
                              ? sanitizeProviderErrorMessage(errorData.error.message)
                              : `Gemini API error: ${geminiResponse.status}`;
                          throw new Error(
                            `${GEMINI_PROVIDER_ERROR}: ${geminiErrorMessage}`
                          );
                        }

                        return (await geminiResponse.json()) as GeminiResponse;
                      } finally {
                        clearTimeout(timeoutId);
                      }
                    },
                    { attempt }
                  );
                } catch (attemptError) {
                  attemptErrorMessage =
                    attemptError instanceof Error
                      ? attemptError.message
                      : String(attemptError);
                  if (
                    attemptError instanceof Error &&
                    (attemptError.name === "AbortError" ||
                      /aborted/i.test(attemptErrorMessage))
                  ) {
                    attemptTimedOut = true;
                    attemptErrorMessage = `Gemini request timed out after ${resolveGeminiRequestTimeoutMs(dbModel)}ms`;
                  }
                  geminiAttempts.push({
                    attempt,
                    startedAt: new Date(attemptStartedAtMs).toISOString(),
                    durationMs: Date.now() - attemptStartedAtMs,
                    httpStatus: attemptHttpStatus,
                    httpOk: attemptHttpOk,
                    finishReasons: [],
                    hasImage: false,
                    timedOut: attemptTimedOut,
                    errorMessage: attemptErrorMessage,
                    reinforcementApplied,
                  });
                  throw attemptError;
                }

                const nextGeneratedImage = await measureGeneratingSubstep(
                  jobId,
                  "responseProcessing",
                  generatingSubstepDurationsMs,
                  async () => {
                    if (!geminiData) {
                      throw new Error("Internal error: Gemini response data is missing.");
                    }

                    if (geminiData.error) {
                      const geminiErrorMessage = geminiData.error.message
                        ? sanitizeProviderErrorMessage(geminiData.error.message)
                        : "Gemini API error";
                      throw new Error(
                        `${GEMINI_PROVIDER_ERROR}: ${geminiErrorMessage}`
                      );
                    }

                    if (isGeminiSafetyBlocked(geminiData)) {
                      throw new Error(SAFETY_POLICY_BLOCKED_ERROR);
                    }

                    const images = extractImagesFromGeminiResponse(geminiData);
                    return images.length > 0 ? images[0] : null;
                  },
                  { attempt }
                );

                const finishReasons = extractGeminiFinishReasons(geminiData);
                geminiAttempts.push({
                  attempt,
                  startedAt: new Date(attemptStartedAtMs).toISOString(),
                  durationMs: Date.now() - attemptStartedAtMs,
                  httpStatus: attemptHttpStatus,
                  httpOk: attemptHttpOk,
                  finishReasons,
                  hasImage: Boolean(nextGeneratedImage),
                  timedOut: false,
                  errorMessage: null,
                  reinforcementApplied,
                });

                if (nextGeneratedImage) {
                  generatedImages = [nextGeneratedImage];
                  break;
                }

                if (attempt < maxAttempts) {
                  console.log(
                    `[Job Processing] No images generated (attempt ${attempt}/${maxAttempts}), retrying...`,
                    { finishReasons }
                  );
                } else {
                  throw new Error("No images generated");
                }
              }

              logJobTimeline(jobId, "生成詳細サマリ", {
                steps: buildGeneratingSubstepSummary(generatingSubstepDurationsMs),
              });

              if (generatedImages.length === 0) {
                throw new Error("No images generated");
              }
            }
          );

          // ===== フェーズ4-2: Supabase Storageへの画像保存 =====
          // MIMEタイプから安全な拡張子を取得（パストラバーサル対策）
          const getSafeExtension = (mimeType: string): string => {
            // 許可されたMIMEタイプのマッピング
            const allowedMimeTypes: Record<string, string> = {
              "image/png": "png",
              "image/jpeg": "jpg",
              "image/jpg": "jpg",
              "image/webp": "webp",
              "image/gif": "gif",
            };
            
            // MIMEタイプを正規化（小文字、前後の空白をトリム）
            const normalizedMimeType = mimeType.toLowerCase().trim();
            
            // 許可されたMIMEタイプか確認
            if (normalizedMimeType in allowedMimeTypes) {
              return allowedMimeTypes[normalizedMimeType];
            }
            
            // 許可されていない場合はデフォルトの拡張子を使用
            return "png";
          };

          type UploadedGeneratedImage = {
            publicUrl: string;
            uploadPath: string;
            resultIndex: number;
            width: number | null;
            height: number | null;
          };

          const uploadedImages: UploadedGeneratedImage[] = [];
          /**
           * アップロード済み画像のうち、DB に紐づかなかった分を削除する。
           *
           * 完了 RPC は冪等で、stale 競合時には別 Worker が作った既存行を返す。
           * その場合、今回アップロードした画像は誰からも参照されない孤児になる。
           * RPC が返した storage_path に含まれないものだけを消すことで、
           * エラー時（persistedPaths なし = 全部消す）と競合時の両方を扱える。
           */
          const cleanupUploadedImages = async (
            reason: string,
            persistedPaths?: readonly string[],
          ) => {
            const keep = new Set(persistedPaths ?? []);
            const uploadPaths = uploadedImages
              .map((image) => image.uploadPath)
              .filter((path) => !keep.has(path));
            if (uploadPaths.length === 0) {
              return;
            }

            const { error: cleanupError } = await supabase.storage
              .from(STORAGE_BUCKET)
              .remove(uploadPaths);

            if (cleanupError) {
              console.warn(
                `[Worker] failed to cleanup uploaded images after ${reason}`,
                cleanupError
              );
            } else {
              console.log(
                `[Worker] cleaned up ${uploadPaths.length} unpersisted uploads after ${reason}`,
              );
            }
          };

          /** 完了 RPC の返り値から storage_path を取り出す。 */
          const extractPersistedPaths = (rows: unknown): string[] =>
            Array.isArray(rows)
              ? (rows as Array<{ storage_path?: unknown }>)
                  .map((row) =>
                    typeof row?.storage_path === "string" ? row.storage_path : null
                  )
                  .filter((path): path is string => path !== null)
              : [];

          currentStage = "uploading";
          await measureJobStage(
            jobId,
            "uploading",
            stageDurationsMs,
            async () => {
              await updateJobProcessingStage(jobId, "uploading");

              try {
                for (const [resultIndex, generatedImage] of generatedImages.entries()) {
                  const byteArray = decodeBase64(generatedImage.data);
                  const dimensions = parseImageDimensions(
                    byteArray,
                    generatedImage.mimeType
                  );
                  const extension = getSafeExtension(generatedImage.mimeType);
                  const randomStr = Math.random().toString(36).substring(2, 15);
                  const fileName = `${job.user_id}/${jobId}-${resultIndex}-${randomStr}.${extension}`;

                  const { data: uploadData, error: uploadError } = await supabase.storage
                    .from(STORAGE_BUCKET)
                    .upload(fileName, byteArray, {
                      contentType: generatedImage.mimeType,
                      upsert: false,
                    });

                  if (uploadError) {
                    console.error("Storage upload error:", uploadError);
                    throw new Error(`画像のアップロードに失敗しました: ${uploadError.message}`);
                  }

                  uploadedImages.push({
                    resultIndex,
                    uploadPath: uploadData.path,
                    publicUrl: supabase.storage
                      .from(STORAGE_BUCKET)
                      .getPublicUrl(uploadData.path).data.publicUrl,
                    width: dimensions?.width ?? null,
                    height: dimensions?.height ?? null,
                  });
                }
              } catch (uploadError) {
                await cleanupUploadedImages("upload failure");
                throw uploadError;
              }
            }
          );

          // ===== フェーズ4-3: generated_imagesテーブルへの保存 =====
          // 「永続化の直前に他ワーカーが状態を変えた」ケースの skip 分岐は
          // 廃止した。両 provider が complete_image_job_with_prompt_secrets を
          // 使うようになり、
          //   - すでに succeeded なら RPC が既存行を返す（冪等）
          //   - それ以外の状態遷移は RPC が例外を投げ、通常の失敗経路で
          //     冪等返金まで進む
          // という形で RPC 側に寄ったため。OpenAI 経路は元からこの挙動だった。
          const imageRecordIds: string[] = [];
          const primaryUploadedImage = uploadedImages[0];
          if (!primaryUploadedImage) {
            throw new Error("No uploaded images");
          }
          // job 側のキー(outputAspectRatioMode / framingMode 等)を保持したまま
          // 成功時の実績情報を追記する(マージ規則は shared の pure helper に集約)。
          const successGenerationMetadata = mergeSuccessGenerationMetadata({
            jobGenerationMetadata: job.generation_metadata as
              | Record<string, unknown>
              | null,
            geminiAttempts,
          });
          currentStage = "persisting";
          await measureJobStage(
            jobId,
            "persisting",
            stageDurationsMs,
            async () => {
              await updateJobProcessingStage(jobId, "persisting", {
                resultImageUrl: primaryUploadedImage.publicUrl,
              });

              if (isOpenAIImageModel(dbModel)) {
                const { data: imageRecords, error: completeJobError } = await supabase.rpc(
                  // 画像行・author secret・job 成功更新を同一トランザクションで
                  // 確定する。旧 complete_image_job_with_generated_images は
                  // 空になった prompt_text をコピーするだけで author secret を
                  // 作らないため、生成した本人が自分のプロンプトを参照できなくなる。
                  "complete_image_job_with_prompt_secrets",
                  {
                    p_job_id: jobId,
                    p_images: uploadedImages.map((image) => ({
                      image_url: image.publicUrl,
                      storage_path: image.uploadPath,
                      width: image.width,
                      height: image.height,
                    })),
                    p_generation_metadata: successGenerationMetadata,
                    p_result_image_url: primaryUploadedImage.publicUrl,
                  }
                );

                if (completeJobError) {
                  console.error("OpenAI batch completion RPC error:", completeJobError);
                  await cleanupUploadedImages("persistence failure");
                  throw new Error(`画像メタデータの保存に失敗しました: ${completeJobError.message}`);
                }

                const rpcImageRecordIds = Array.isArray(imageRecords)
                  ? imageRecords
                      .map((row) =>
                        typeof row?.id === "string" ? row.id : null
                      )
                      .filter((id): id is string => id !== null)
                  : [];

                if (rpcImageRecordIds.length !== uploadedImages.length) {
                  console.warn(
                    `[Worker] OpenAI batch RPC returned ${rpcImageRecordIds.length} image records for ${uploadedImages.length} uploads`,
                    { jobId }
                  );
                }

                // stale 競合で別 Worker の既存行が返った場合、今回アップロードした
                // 画像は誰からも参照されない。返却 storage_path に無い分を消す。
                await cleanupUploadedImages(
                  "atomic completion",
                  extractPersistedPaths(imageRecords),
                );

                imageRecordIds.push(...rpcImageRecordIds);
                return;
              }

              // Gemini 経路も OpenAI と同じ原子的 RPC で確定する。
              //
              // 以前は「画像を INSERT → author secret を別リクエストで upsert →
              // job を成功更新」の3手順に分かれており、secret の失敗をログだけで
              // 握りつぶしていた。generated_images.prompt を空にした後は、この
              // 部分成功が「画像はあるがプロンプトが永久に空」という表示欠損として
              // 顕在化する。ジョブは成功扱いなので再試行も返金もされない。
              // Phase 0B で実際に起きた事故と同型なので、同一トランザクションへ
              // 寄せる（計画書 Phase 0B「Gemini/OpenAI双方の画像永続化を新RPCへ統一」）。
              //
              // model と background_mode は Worker 側で正規化した値を渡す。
              // 直接 INSERT 時代は normalizeModelName / resolveBackgroundMode の
              // 結果を書いていたため、RPC がジョブの生値を書くと挙動が変わる。
              //
              // source_image_stock_id は RPC 内で FOR UPDATE 付きに読み直した
              // ジョブの値を使う。生成中にユーザーがストック保存した場合の
              // 後追い更新も、Worker 起動時の古い値ではなく最新が反映される。
              const { data: geminiImageRecords, error: geminiCompleteError } =
                await supabase.rpc("complete_image_job_with_prompt_secrets", {
                  p_job_id: jobId,
                  p_images: [
                    {
                      image_url: primaryUploadedImage.publicUrl,
                      storage_path: primaryUploadedImage.uploadPath,
                      width: primaryUploadedImage.width,
                      height: primaryUploadedImage.height,
                    },
                  ],
                  p_generation_metadata: successGenerationMetadata,
                  p_result_image_url: primaryUploadedImage.publicUrl,
                  p_model: dbModel,
                  p_background_mode: backgroundMode,
                });

              if (geminiCompleteError) {
                console.error(
                  "Failed to complete image job atomically:",
                  geminiCompleteError,
                );
                // DB に紐づかなかったアップロードを孤児にしない
                await cleanupUploadedImages("persistence failure");
                throw new Error(
                  `画像メタデータの保存に失敗しました: ${geminiCompleteError.message}`,
                );
              }

              const geminiRecordIds = Array.isArray(geminiImageRecords)
                ? (geminiImageRecords as Array<{ id?: unknown }>)
                    .map((row) => (typeof row?.id === "string" ? row.id : null))
                    .filter((id): id is string => id !== null)
                : [];

              if (geminiRecordIds.length === 0) {
                // RPC は冪等で、既に成功済みなら既存行を返す。0 件は想定外。
                await cleanupUploadedImages("empty persistence result");
                throw new Error("画像メタデータの保存結果が空です");
              }

              // stale 競合で別 Worker の既存行が返った場合、今回アップロードした
              // 画像は誰からも参照されない。返却 storage_path に無い分を消す。
              await cleanupUploadedImages(
                "atomic completion",
                extractPersistedPaths(geminiImageRecords),
              );

              imageRecordIds.push(...geminiRecordIds);

              // credit_transactions.related_generation_id の更新は
              // complete_image_job_with_prompt_secrets が同一トランザクション内で
              // 行うため、ここでの後追い更新は不要になった。
            }
          );

          await deleteGeneratedImagesTempReferenceImageIfExists(
            supabase,
            generatedImagesTempReferencePathToCleanup,
          );

          const siteUrl = Deno.env.get("SITE_URL");
          const cronSecret = Deno.env.get("CRON_SECRET");
          if (siteUrl && cronSecret && imageRecordIds.length > 0) {
            imageRecordIds.forEach((imageRecordId) => {
              scheduleEnsureWebPVariantsNotification(
                siteUrl,
                cronSecret,
                imageRecordId
              );
              schedulePersistBeforeImageNotification(
                siteUrl,
                cronSecret,
                imageRecordId
              );
            });
          } else {
            console.warn(
              "[Job Success] Skipped WebP / Before persistence notifications because SITE_URL, CRON_SECRET, or image records are not configured"
            );
          }

          currentStage = null;
          const completedAtMs = Date.now();
          const totalDurationMs =
            createdAtMs !== null && !Number.isNaN(createdAtMs)
              ? Math.max(completedAtMs - createdAtMs, 0)
              : null;
          logJobTimingSummary({
            jobId,
            outcome: "ジョブ完了",
            queueWaitMs,
            workerDurationMs: Math.max(completedAtMs - workerStartedAtMs, 0),
            totalDurationMs,
            stageDurationsMs,
          });

          // メッセージを削除（成功時）
          await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });

          processedCount++;
        } catch (error) {
          // ===== フェーズ4-4: 失敗時の処理 =====
          const errorMessage = sanitizeProviderErrorMessage(
            error instanceof Error ? error.message : "Unknown error"
          );
          console.error("[Job Processing] Generation error:", {
            message: errorMessage,
            stack: error instanceof Error
              ? sanitizeProviderErrorMessage(error.stack ?? "")
              : undefined,
          });
          const failedAtMs = Date.now();
          const totalDurationMs =
            createdAtMs !== null && !Number.isNaN(createdAtMs)
              ? Math.max(failedAtMs - createdAtMs, 0)
              : null;
          logJobTimingSummary({
            jobId,
            outcome: "ジョブ失敗",
            queueWaitMs,
            workerDurationMs: Math.max(failedAtMs - workerStartedAtMs, 0),
            totalDurationMs,
            stageDurationsMs,
            currentStage,
            errorMessage,
          });

          // 現在のジョブのattemptsを取得（更新前に取得する必要がある）
          const { data: currentJob, error: jobFetchError } = await supabase
            .from("image_jobs")
            .select("attempts, started_at")
            .eq("id", jobId)
            .single();

          if (jobFetchError) {
            console.error("Failed to fetch job attempts:", jobFetchError);
            // ジョブの取得に失敗した場合、メッセージは削除しない（可視性タイムアウト後に再処理される）
            continue;
          }

          const newAttempts = (currentJob?.attempts || 0) + 1;
          const isNonRetriable = isNonRetriableGenerationError(errorMessage);
          const shouldMarkAsFailed = isNonRetriable || newAttempts >= 2;

          // image_jobsテーブルを更新（失敗時）
          const failureGenerationMetadata = {
            ...(job.generation_metadata as Record<string, unknown> | null ?? {}),
            geminiAttempts,
          };
          const { data: failUpdatedJob, error: failUpdateError } = await supabase
            .from("image_jobs")
            .update({
              status: shouldMarkAsFailed ? "failed" : "queued",
              processing_stage: shouldMarkAsFailed ? "failed" : "queued",
              result_image_url: null,
              error_message: errorMessage,
              attempts: newAttempts,
              started_at: shouldMarkAsFailed ? currentJob?.started_at ?? job.started_at : null,
              completed_at: shouldMarkAsFailed ? new Date().toISOString() : null,
              generation_metadata: failureGenerationMetadata,
            })
            .eq("id", jobId)
            .eq("status", "processing")
            .select("id")
            .maybeSingle();

          if (failUpdateError) {
            console.error("Failed to update job status to failed:", failUpdateError);
            // 更新に失敗した場合、メッセージは削除しない（可視性タイムアウト後に再処理される）
            continue;
          }

          if (!failUpdatedJob) {
            skippedCount++;
            continue;
          }

          // 最終失敗が確定した場合のみ課金後処理を行う。
          // 完了してからだけ ack する（未返金のまま捨てないため）。
          if (shouldMarkAsFailed) {
            const settled = await settleFailedJobBillingWithSupabase(supabase, {
              jobId,
              job,
              errorMessage,
              isFreeOneTapStyleJob,
              reservedAttemptId,
            });

            if (settled) {
              const { error: failDeleteError } = await supabase.rpc("pgmq_delete", {
                p_queue_name: QUEUE_NAME,
                p_msg_id: msgId,
              });
              if (failDeleteError) {
                console.error(
                  "Failed to delete message after final failure:",
                  failDeleteError,
                );
              }
            } else {
              // メッセージを残す。可視性タイムアウト後に再配送され、
              // 冒頭の failed 分岐が reconciliation として課金後処理を再実行する。
              console.warn(
                `[Job Processing] Left message for billing reconciliation: ${jobId}`,
              );
            }
          }
        }
      } catch (error) {
        console.error("Error processing message:", error);
        // エラーが発生した場合、メッセージは削除しない（可視性タイムアウト後に再処理される）
      }
    }

    return new Response(
      JSON.stringify({
        processed: processedCount,
        skipped: skippedCount,
        total: messages.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge Function error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: errorMessage,
        stack: errorStack,
        type: error instanceof Error ? error.constructor.name : typeof error,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
