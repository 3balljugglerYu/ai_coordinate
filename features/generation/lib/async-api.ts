/**
 * 非同期画像生成APIクライアント
 * 非同期画像生成ジョブの投入とステータス取得を行う
 */

import type { GenerationRequest } from "../types";
import {
  DEFAULT_GENERATION_MODEL,
  backgroundModeToBackgroundChange,
  resolveBackgroundMode,
} from "../types";
import type { ImageJobProcessingStage } from "./job-types";
import { normalizeSourceImage } from "./normalize-source-image";

interface AsyncGenerationApiMessages {
  imageLoadFailed?: string;
  imageConvertFailed?: string;
  imageContextUnavailable?: string;
  submitJobFailed?: string;
  requestIdLabel?: string;
  fetchStatusFailed?: string;
  fetchJobsFailed?: string;
  pollingStopped?: string;
  pollingTimeout?: string;
}

function logCoordinateGenerationTiming(
  event: string,
  payload: Record<string, string | number | null>
) {
  console.info(`[Coordinate Generation Timing] ${event}`, payload);
}

interface AsyncGenerationErrorResponse {
  error?: string;
  errorCode?: string;
  requestId?: string;
}

/**
 * 非同期画像生成ジョブ投入のレスポンス型
 */
export interface AsyncGenerationResponse {
  jobId: string;
  status: string;
}

/**
 * 非同期画像生成ステータス取得のレスポンス型
 */
export interface AsyncGenerationStatus {
  id: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  processingStage: ImageJobProcessingStage | null;
  previewImageUrl: string | null;
  resultImageUrl: string | null;
  errorMessage: string | null;
  generatedImageId: string | null;
}

/**
 * 非同期画像生成ジョブを投入
 */
export async function generateImageAsync(
  request: Omit<GenerationRequest, "count">,
  messages?: AsyncGenerationApiMessages
): Promise<AsyncGenerationResponse> {
  const backgroundMode = resolveBackgroundMode(
    request.backgroundMode,
    request.backgroundChange
  );

  // 画像をBase64に変換（sourceImageがある場合のみ）
  // ストック画像IDの場合は、サーバー側で処理するためBase64に変換しない
  let sourceImageBase64: string | undefined;
  let sourceImageMimeType: string | undefined;

  if (request.sourceImage) {
    const normalizeStartedAt = performance.now();
    const { imageToBase64 } = await import("./nanobanana");
    const normalizedSourceImage = await normalizeSourceImage(
      request.sourceImage,
      messages
    );
    const normalizeFinishedAt = performance.now();
    sourceImageBase64 = await imageToBase64(normalizedSourceImage);
    sourceImageMimeType = normalizedSourceImage.type;
    const encodeFinishedAt = performance.now();

    logCoordinateGenerationTiming("sourceImagePrepared", {
      originalBytes: request.sourceImage.size,
      normalizedBytes: normalizedSourceImage.size,
      normalizeMs: Math.round(normalizeFinishedAt - normalizeStartedAt),
      encodeMs: Math.round(encodeFinishedAt - normalizeFinishedAt),
      totalPrepareMs: Math.round(encodeFinishedAt - normalizeStartedAt),
    });
  }
  // sourceImageStockIdの場合は、サーバー側で処理するためここでは何もしない

  const response = await fetch("/api/generate-async", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: request.prompt,
      sourceImageBase64,
      sourceImageMimeType,
      sourceImageStockId: request.sourceImageStockId,
      sourceImageType: request.sourceImageType || "illustration",
      backgroundMode,
      backgroundChange: backgroundModeToBackgroundChange(backgroundMode),
      generationType: request.generationType || "coordinate",
      model: request.model || DEFAULT_GENERATION_MODEL,
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | AsyncGenerationErrorResponse
      | null;
    const baseMessage =
      error?.error || messages?.submitJobFailed || "画像生成ジョブの投入に失敗しました";

    if (error?.errorCode === "GENERATION_ASYNC_FAILED" && error.requestId) {
      throw new Error(
        `${baseMessage}\n${messages?.requestIdLabel || "Request ID"}: ${error.requestId}`
      );
    }

    throw new Error(baseMessage);
  }

  const data: AsyncGenerationResponse = await response.json();
  return data;
}

/**
 * 非同期画像生成ステータスを取得
 */
export async function getGenerationStatus(
  jobId: string,
  messages?: AsyncGenerationApiMessages
): Promise<AsyncGenerationStatus> {
  const response = await fetch(`/api/generation-status?id=${encodeURIComponent(jobId)}`);

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      error?.error || messages?.fetchStatusFailed || "ステータスの取得に失敗しました"
    );
  }

  const data = await response.json();
  return {
    id: data.id,
    status: data.status,
    processingStage: data.processingStage || null,
    previewImageUrl: data.previewImageUrl || null,
    resultImageUrl: data.resultImageUrl || null,
    errorMessage: data.errorMessage || null,
    generatedImageId:
      typeof data.generatedImageId === "string" ? data.generatedImageId : null,
  };
}

/**
 * 画像生成ジョブのステータス型（未完了・完了済みを含む）
 */
export interface JobStatus {
  id: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  processingStage: ImageJobProcessingStage | null;
  createdAt: string;
}

/**
 * 未完了画像生成ジョブを取得
 * @param includeRecent 最近完了したジョブ（直近5分以内）も含めるかどうか
 * @returns ジョブの一覧（未完了と最近完了したジョブ）
 */
export async function getInProgressJobs(
  includeRecent: boolean = false,
  messages?: AsyncGenerationApiMessages
): Promise<JobStatus[]> {
  const url = includeRecent
    ? "/api/generation-status/in-progress?includeRecent=true"
    : "/api/generation-status/in-progress";
  
  const response = await fetch(url);

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      error?.error || messages?.fetchJobsFailed || "ジョブの取得に失敗しました"
    );
  }

  const data = await response.json();
  return data.jobs || [];
}

/**
 * ポーリング停止可能な非同期画像生成ステータス監視
 */
export interface PollGenerationStatusResult {
  promise: Promise<AsyncGenerationStatus>;
  stop: () => void; // ポーリングを停止する関数
}

/**
 * 非同期画像生成ステータスをポーリングで監視（停止可能）
 * @returns ポーリングのPromiseと停止関数を含むオブジェクト
 */
export function pollGenerationStatus(
  jobId: string,
  options: {
    interval?:
      | number
      | ((status: AsyncGenerationStatus) => number); // ポーリング間隔（ミリ秒、デフォルト: 2000）
    timeout?: number; // タイムアウト（ミリ秒、デフォルト: 300000 = 5分）
    onStatusUpdate?: (status: AsyncGenerationStatus) => void; // ステータス更新時のコールバック
    messages?: AsyncGenerationApiMessages;
  } = {}
): PollGenerationStatusResult {
  const { interval = 2000, timeout = 300000, onStatusUpdate, messages } = options;
  const startTime = Date.now();
  let timeoutId: number | null = null;
  let isStopped = false;

  const stop = () => {
    isStopped = true;
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const promise = new Promise<AsyncGenerationStatus>((resolve, reject) => {
    const poll = async () => {
      // 停止された場合は処理を中断
      if (isStopped) {
        reject(new Error(messages?.pollingStopped || "ポーリングが停止されました"));
        return;
      }

      try {
        // タイムアウトチェック
        if (Date.now() - startTime > timeout) {
          reject(new Error(messages?.pollingTimeout || "ポーリングがタイムアウトしました"));
          return;
        }

        const status = await getGenerationStatus(jobId, messages);
        
        // 停止された場合は処理を中断
        if (isStopped) {
          reject(new Error(messages?.pollingStopped || "ポーリングが停止されました"));
          return;
        }

        // コールバックを呼び出し
        if (onStatusUpdate) {
          onStatusUpdate(status);
        }

        // 完了または失敗した場合は解決
        if (status.status === "succeeded" || status.status === "failed") {
          resolve(status);
          return;
        }

        // 続行中の場合は再ポーリング
        const nextInterval =
          typeof interval === "function" ? interval(status) : interval;
        timeoutId = window.setTimeout(poll, nextInterval);
      } catch (error) {
        // 停止された場合は処理を中断（エラーを投げない）
        if (isStopped) {
          return;
        }
        reject(error);
      }
    };

    // 初回ポーリングを開始
    poll();
  });

  return { promise, stop };
}
