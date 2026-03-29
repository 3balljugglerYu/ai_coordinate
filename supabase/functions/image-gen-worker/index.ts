// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import { decodeBase64, encodeBase64 } from "jsr:@std/encoding@1/base64";
import {
  buildPrompt as buildSharedPrompt,
  backgroundModeToBackgroundChange,
  resolveBackgroundMode,
} from "../../../shared/generation/prompt-core.ts";
import type {
  GenerationType,
} from "../../../shared/generation/prompt-core.ts";
import {
  MALFORMED_GEMINI_PARTS_ERROR,
  isInvalidGeminiArgumentErrorMessage,
  isMalformedGeminiPartsErrorMessage,
  SAFETY_POLICY_BLOCKED_ERROR,
  isSafetyPolicyBlockedErrorMessage,
} from "../../../shared/generation/errors.ts";

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

type InputImageData = {
  base64: string;
  mimeType: string;
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
    try {
      const response = await fetch(inputImageUrl);
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
      lastError = error;
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

async function downloadInputImageViaStorageFallback(
  supabase: ReturnType<typeof createClient>,
  inputImageUrl: string
): Promise<InputImageData> {
  const location = parseStorageObjectFromUrl(inputImageUrl);
  if (!location) {
    throw new Error("Storage path could not be parsed from input_image_url");
  }

  const { data, error } = await supabase.storage
    .from(location.bucket)
    .download(location.objectPath);

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
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(stock.storage_path);

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
type GeminiModel =
  | "gemini-2.5-flash-image"
  | "gemini-3.1-flash-image-preview-512"
  | "gemini-3.1-flash-image-preview-1024"
  | "gemini-3-pro-image-1k"
  | "gemini-3-pro-image-2k"
  | "gemini-3-pro-image-4k";
type GeminiApiModel =
  | "gemini-2.5-flash-image"
  | "gemini-3.1-flash-image-preview"
  | "gemini-3-pro-image-preview";
type GeminiImageSize = "512" | "1K" | "2K" | "4K";

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
    return "gemini-2.5-flash-image";
  }
  if (model === "gemini-2.5-flash-image-preview" || model === "gemini-2.5-flash-image") {
    return "gemini-2.5-flash-image";
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
  return "gemini-2.5-flash-image";
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
  };
  return costs[normalized] ?? 20;
}

/**
 * 再試行不可のエラーか判定
 */
function isNonRetriableGenerationError(errorMessage: string): boolean {
  return (
    errorMessage === "No images generated" ||
    isInvalidGeminiArgumentErrorMessage(errorMessage) ||
    isMalformedGeminiPartsErrorMessage(errorMessage) ||
    isSafetyPolicyBlockedErrorMessage(errorMessage)
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
  percoinAmount: number
): Promise<void> {
  try {
    console.log(`[Percoin Refund] Starting refund for user ${userId}, job ${jobId}, amount ${percoinAmount}`);

    // 互換性のため request値は引き続き算出するが、
    // 実際の返金配分は DB 側 refund_percoins が allocation 明細を優先して決定する。
    // （旧データのみ legacy fallback で request値を使用）
    const { data: consumptionTx, error: consumptionError } = await supabase
      .from("credit_transactions")
      .select("id, metadata")
      .eq("user_id", userId)
      .eq("transaction_type", "consumption")
      .eq("metadata->>job_id", jobId)
      .maybeSingle();

    if (consumptionError) {
      throw new Error(`消費履歴の確認に失敗しました: ${consumptionError.message}`);
    }

    if (!consumptionTx) {
      console.warn(`[Percoin Refund] Consumption transaction not found for job ${jobId}, skipping refund`);
      return;
    }

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

    // 環境変数のチェック（詳細なエラーメッセージを返す）
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

    if (!geminiApiKey) {
      console.error("Missing GEMINI_API_KEY environment variable");
      return new Response(
        JSON.stringify({ 
          error: "Missing environment variable: GEMINI_API_KEY",
          message: "Please set GEMINI_API_KEY or GOOGLE_AI_STUDIO_API_KEY in Edge Function Secrets"
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

        // 冪等性チェック: 既に完了している場合はメッセージを削除してスキップ
        if (job.status === "succeeded") {
          await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });
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
          const shouldMarkAsFailed = newAttempts >= 3;
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

          // 最終失敗確定時のみ返金（未減算ジョブの過剰返金も防ぐ）
          try {
            const { data: consumptionTx } = await supabase
              .from("credit_transactions")
              .select("id")
              .eq("user_id", job.user_id)
              .eq("transaction_type", "consumption")
              .eq("metadata->>job_id", jobId)
              .maybeSingle();

            if (consumptionTx) {
              const percoinCost = getPercoinCost(job.model);
              await refundPercoinsFromGeneration(
                supabase,
                job.user_id,
                jobId,
                percoinCost
              );
              console.log(`[Job Processing] Refunded ${percoinCost} percoins for final stale-failed job ${jobId}`);
            }
          } catch (refundError) {
            console.error("[Job Processing] Failed to refund final stale-failed job:", refundError);
          }

          // 失敗確定したためメッセージを削除
          await supabase.rpc("pgmq_delete", {
            p_queue_name: QUEUE_NAME,
            p_msg_id: msgId,
          });
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
          .in("status", ["queued", "failed"]) // 既にprocessingの場合は更新しない
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
        const dbModel = normalizeModelName(job.model);
        const apiModel = toApiModelName(dbModel);
        const backgroundMode = resolveBackgroundMode(
          job.background_mode,
          job.background_change
        );

        logJobTimeline(jobId, "ジョブ開始", {
          generationType: job.generation_type,
          model: dbModel,
          sourceImage: job.input_image_url ? "yes" : "no",
          queueWait: formatDurationMs(queueWaitMs),
        });

        // ===== ペルコイン減算処理（画像生成前に実行） =====
        currentStage = "charging";
        try {
          await measureJobStage(
            jobId,
            "charging",
            stageDurationsMs,
            async () => {
              await updateJobProcessingStage(jobId, "charging");
              const percoinCost = getPercoinCost(job.model);
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

        // ===== フェーズ4-1: Gemini API呼び出しの実装 =====
        try {
          let generatedImage: { mimeType: string; data: string } | null = null;
          currentStage = "generating";
          await measureJobStage(
            jobId,
            "generating",
            stageDurationsMs,
            async () => {
              await updateJobProcessingStage(jobId, "generating");
              const generatingSubstepDurationsMs: GeneratingSubstepDurationsMs = {};
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

                    parts.push({
                      inline_data: {
                        mime_type: inputImageData.mimeType,
                        data: inputImageData.base64,
                      },
                    });
                  }

                  const fullPrompt = job.input_image_url
                    ? buildSharedPrompt({
                        generationType: job.generation_type as GenerationType,
                        outfitDescription: job.prompt_text,
                        backgroundMode,
                        sourceImageType:
                          job.source_image_type === "real" ? "real" : "illustration",
                      })
                    : job.prompt_text;

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
                      threshold: "BLOCK_ONLY_HIGH";
                    }>;
                    generationConfig?: {
                      candidateCount?: number;
                      responseModalities?: Array<"TEXT" | "IMAGE">;
                      imageConfig?: {
                        imageSize?: GeminiImageSize;
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
                      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
                      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
                    ],
                  };

                  const imageSize = extractImageSize(dbModel);

                  if (apiModel === "gemini-3.1-flash-image-preview") {
                    if (!imageSize) {
                      throw new Error(`Unsupported image size for model: ${dbModel}`);
                    }
                    nextRequestBody.generationConfig = {
                      ...nextRequestBody.generationConfig,
                      candidateCount: 1,
                      responseModalities: ["TEXT", "IMAGE"],
                      imageConfig: {
                        imageSize,
                      },
                    };
                  } else if (apiModel === "gemini-3-pro-image-preview" && imageSize) {
                    nextRequestBody.generationConfig = {
                      ...nextRequestBody.generationConfig,
                      imageConfig: {
                        imageSize,
                      },
                    };
                  }

                  return nextRequestBody;
                }
              );

              const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent`;
              const maxAttempts = 2;

              for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                const geminiData = await measureGeneratingSubstep(
                  jobId,
                  "geminiRequest",
                  generatingSubstepDurationsMs,
                  async () => {
                    const geminiResponse = await fetch(apiUrl, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": geminiApiKey,
                      },
                      body: JSON.stringify(requestBody),
                    });

                    if (!geminiResponse.ok) {
                      const errorData = await geminiResponse.json();
                      throw new Error(
                        errorData.error?.message || `Gemini API error: ${geminiResponse.status}`
                      );
                    }

                    return (await geminiResponse.json()) as GeminiResponse;
                  },
                  { attempt }
                );

                const nextGeneratedImage = await measureGeneratingSubstep(
                  jobId,
                  "responseProcessing",
                  generatingSubstepDurationsMs,
                  async () => {
                    if (geminiData.error) {
                      throw new Error(geminiData.error.message || "Gemini API error");
                    }

                    if (isGeminiSafetyBlocked(geminiData)) {
                      throw new Error(SAFETY_POLICY_BLOCKED_ERROR);
                    }

                    const images = extractImagesFromGeminiResponse(geminiData);
                    return images.length > 0 ? images[0] : null;
                  },
                  { attempt }
                );

                if (nextGeneratedImage) {
                  generatedImage = nextGeneratedImage;
                  break;
                }

                if (attempt < maxAttempts) {
                  console.log(
                    `[Job Processing] No images generated (attempt ${attempt}/${maxAttempts}), retrying...`
                  );
                } else {
                  throw new Error("No images generated");
                }
              }

              logJobTimeline(jobId, "生成詳細サマリ", {
                steps: buildGeneratingSubstepSummary(generatingSubstepDurationsMs),
              });

              if (!generatedImage) {
                throw new Error("No images generated");
              }
            }
          );

          // 最初の画像を使用（複数生成の場合は1枚目を使用）

          // ===== フェーズ4-2: Supabase Storageへの画像保存 =====
          // Base64をUint8Arrayに変換
          const base64Data = generatedImage.data;
          const byteArray = decodeBase64(base64Data);

          // ファイル名を生成（ユーザーID + タイムスタンプ + ランダム文字列）
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 15);
          
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

          const extension = getSafeExtension(generatedImage.mimeType);
          const fileName = `${job.user_id}/${timestamp}-${randomStr}.${extension}`;
          let publicUrl = "";
          let uploadPath = "";

          currentStage = "uploading";
          await measureJobStage(
            jobId,
            "uploading",
            stageDurationsMs,
            async () => {
              await updateJobProcessingStage(jobId, "uploading");

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

              uploadPath = uploadData.path;
              publicUrl = supabase.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(uploadData.path).data.publicUrl;
            }
          );

          // ===== フェーズ4-3: generated_imagesテーブルへの保存 =====
          let shouldSkipAfterPersist = false;
          let imageRecordId = "";
          currentStage = "persisting";
          await measureJobStage(
            jobId,
            "persisting",
            stageDurationsMs,
            async () => {
              await updateJobProcessingStage(jobId, "persisting", {
                resultImageUrl: publicUrl,
              });

              const { data: imageRecord, error: insertError } = await supabase
                .from("generated_images")
                .insert({
                  user_id: job.user_id,
                  image_url: publicUrl,
                  storage_path: uploadPath,
                  prompt: job.prompt_text,
                  background_mode: backgroundMode,
                  background_change: backgroundModeToBackgroundChange(backgroundMode),
                  is_posted: false,
                  generation_type: job.generation_type,
                  model: dbModel,
                  source_image_stock_id: job.source_image_stock_id,
                })
                .select()
                .single();

              if (insertError) {
                console.error("Database insert error:", insertError);
                throw new Error(`画像メタデータの保存に失敗しました: ${insertError.message}`);
              }

              imageRecordId = imageRecord.id;

              // ===== フェーズ4-4: 成功時の処理 =====
              // image_jobsテーブルを更新（成功時）
              const { data: succeededJob, error: successUpdateError } = await supabase
                .from("image_jobs")
                .update({
                  status: "succeeded",
                  processing_stage: "completed",
                  result_image_url: publicUrl,
                  error_message: null,
                  completed_at: new Date().toISOString(),
                })
                .eq("id", jobId)
                .eq("status", "processing")
                .select("id")
                .maybeSingle();

              if (successUpdateError) {
                console.error("Failed to update job status to succeeded:", successUpdateError);
                throw new Error(`ジョブステータスの更新に失敗しました: ${successUpdateError.message}`);
              }

              if (!succeededJob) {
                console.warn(`[Job Success] Skipped succeeded update because status changed: ${jobId}`);
                skippedCount++;
                shouldSkipAfterPersist = true;
                return;
              }

              // credit_transactionsのrelated_generation_idを更新
              // 画像生成前にNULLで保存していた取引履歴を、generated_images.idに更新
              try {
                const { error: updateTransactionError } = await supabase
                  .from("credit_transactions")
                  .update({ related_generation_id: imageRecord.id })
                  .eq("user_id", job.user_id)
                  .is("related_generation_id", null) // NULLの取引履歴を検索
                  .eq("transaction_type", "consumption")
                  .eq("metadata->>job_id", jobId); // metadata内のjob_idで特定
                
                if (updateTransactionError) {
                  console.error("[Job Success] Failed to update credit transaction:", updateTransactionError);
                  // エラーはログに記録するが、処理は継続
                } else {
                  console.log(`[Job Success] Updated credit transaction related_generation_id to ${imageRecord.id}`);
                }
              } catch (updateTransactionError) {
                console.error("[Job Success] Failed to update credit transaction:", updateTransactionError);
                // エラーはログに記録するが、処理は継続
              }
            }
          );

          if (shouldSkipAfterPersist) {
            const skippedAtMs = Date.now();
            const totalDurationMs =
              createdAtMs !== null && !Number.isNaN(createdAtMs)
                ? Math.max(skippedAtMs - createdAtMs, 0)
                : null;
            logJobTimingSummary({
              jobId,
              outcome: "ジョブスキップ",
              queueWaitMs,
              workerDurationMs: Math.max(skippedAtMs - workerStartedAtMs, 0),
              totalDurationMs,
              stageDurationsMs,
              currentStage,
            });
            continue;
          }

          const siteUrl = Deno.env.get("SITE_URL");
          const cronSecret = Deno.env.get("CRON_SECRET");
          if (siteUrl && cronSecret) {
            scheduleEnsureWebPVariantsNotification(
              siteUrl,
              cronSecret,
              imageRecordId
            );
          } else {
            console.warn(
              "[Job Success] Skipped WebP notification because SITE_URL or CRON_SECRET is not configured"
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
          console.error("[Job Processing] Generation error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
          const shouldMarkAsFailed = isNonRetriable || newAttempts >= 3;

          // image_jobsテーブルを更新（失敗時）
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

          // 最終失敗が確定した場合のみ返金
          if (shouldMarkAsFailed) {
            try {
              const percoinCost = getPercoinCost(job.model);
              await refundPercoinsFromGeneration(
                supabase,
                job.user_id,
                jobId,
                percoinCost
              );
              console.log(`[Job Processing] Refunded ${percoinCost} percoins for finally failed job ${jobId}`);
            } catch (refundError) {
              // 返金失敗はログに記録（既に減算されているため、手動対応が必要な可能性がある）
              console.error("[Job Processing] Failed to refund percoins after final generation failure:", refundError);
            }
          }

          // メッセージの削除/アーカイブ（即時失敗またはattempts >= 3の場合）
          if (shouldMarkAsFailed) {
            await supabase.rpc("pgmq_delete", {
              p_queue_name: QUEUE_NAME,
              p_msg_id: msgId,
            });
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
