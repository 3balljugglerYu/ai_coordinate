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
import { buildPromptRequestFields } from "./prompt-locked-submission";

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
  /** 送信そのものが通信エラーで届かなかったとき */
  networkErrorSubmit?: string;
  /** 進捗の取得が続けて失敗し、追跡を諦めたとき */
  networkErrorPolling?: string;
}

/**
 * ポーリングを諦めるまでに許す「連続」失敗回数。
 *
 * モバイル回線では 90 秒級の生成中に取得が 1 回落ちることが普通にある。
 * 1 回で打ち切ると、サーバー側では走り続けているジョブを UI が見失い、
 * ユーザーには「失敗した」ように見える(2026-09-10 の実障害)。
 */
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

/** 失敗後の待ち時間。連続失敗ごとに伸ばす(2s → 4s)。 */
function pollRetryDelayMs(consecutiveFailures: number): number {
  return Math.min(2000 * consecutiveFailures, 6000);
}

/**
 * `fetch` が拒否したとき(= ネットワーク層の失敗)に、ブラウザの生メッセージを
 * そのまま投げないためのラッパー。
 *
 * iOS Safari は `TypeError: Load failed`、Chrome は `Failed to fetch` を返す。
 * 呼び出し側はこれを画面に出してしまうため、ここでロケール済みの文言に置き換える。
 * HTTP レスポンスが返ってきた場合(4xx/5xx 含む)は素通しし、従来どおり呼び出し側で扱う。
 */
async function fetchOrThrowLocalized(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  networkErrorMessage: string
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(networkErrorMessage);
  }
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
  resultImages?: Array<{ id: string; url: string }>;
  errorMessage: string | null;
  generatedImageId: string | null;
}

/**
 * 非同期画像生成ジョブを投入
 */
export async function generateImageAsync(
  request: GenerationRequest,
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

  const response = await fetchOrThrowLocalized("/api/generate-async", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // 派生生成では本文を送らない。同時指定は schema が 400 にする（ADR-006）。
      ...buildPromptRequestFields({
        prompt: request.prompt,
        sourcePostId: request.sourcePostId,
      }),
      sourceImageBase64,
      sourceImageMimeType,
      sourceImageStockId: request.sourceImageStockId,
      sourceImageGeneratedId: request.sourceImageGeneratedId,
      sourceImageType: request.sourceImageType || "illustration",
      backgroundMode,
      backgroundChange: backgroundModeToBackgroundChange(backgroundMode),
      generationType: request.generationType || "coordinate",
      model: request.model || DEFAULT_GENERATION_MODEL,
      // framing_mode は UI の選択 (free_pose / locked) を常に明示送信する。
      // 省略に頼らず値を必ず載せることで、サーバの省略時フォールバックと UI 既定の乖離を防ぐ。
      ...(request.framingMode
        ? { framingMode: request.framingMode }
        : {}),
      // じゆうモードの出力比率は free のときのみ送信する(他モードに混入させない)。
      // "source" は既定=非上書きのため送らない。明示比率だけ載せる。
      ...(request.generationType === "free" &&
      request.outputAspectRatioMode &&
      request.outputAspectRatioMode !== "source"
        ? { outputAspectRatioMode: request.outputAspectRatioMode }
        : {}),
    }),
  },
    messages?.networkErrorSubmit ||
      "通信が不安定なため、生成を開始できませんでした。電波の良い場所でもう一度お試しください。"
  );

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
  const response = await fetchOrThrowLocalized(
    `/api/generation-status?id=${encodeURIComponent(jobId)}`,
    undefined,
    messages?.networkErrorPolling ||
      "通信が不安定です。生成は続いている可能性があるため、しばらくしてから画面を開き直してください。"
  );

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
    resultImages: Array.isArray(data.resultImages)
      ? data.resultImages.filter(
          (item: unknown): item is { id: string; url: string } =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as { id?: unknown }).id === "string" &&
            typeof (item as { url?: unknown }).url === "string"
        )
      : undefined,
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
  
  const response = await fetchOrThrowLocalized(
    url,
    undefined,
    messages?.networkErrorPolling ||
      "通信が不安定です。生成は続いている可能性があるため、しばらくしてから画面を開き直してください。"
  );

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
    timeout?: number; // タイムアウト（ミリ秒、デフォルト: 600000 = 10分）
    onStatusUpdate?: (status: AsyncGenerationStatus) => void; // ステータス更新時のコールバック
    messages?: AsyncGenerationApiMessages;
  } = {}
): PollGenerationStatusResult {
  const { interval = 2000, timeout = 600000, onStatusUpdate, messages } = options;
  const startTime = Date.now();
  let timeoutId: number | null = null;
  let isStopped = false;
  // 連続で失敗した回数。1 回でも取得できたらリセットする。
  let consecutiveFailures = 0;

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
        consecutiveFailures = 0;

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

        // 取得の失敗はジョブの失敗ではない。ジョブが失敗したときは
        // status === "failed" で resolve される経路を通る。
        // ここに来るのは通信断・一時的な 5xx なので、続けて何度も落ちるまでは
        // 追跡を諦めない(2026-09-10 の実障害: 1 回の取得失敗で生成を見失った)。
        consecutiveFailures += 1;
        if (consecutiveFailures < MAX_CONSECUTIVE_POLL_FAILURES) {
          timeoutId = window.setTimeout(
            poll,
            pollRetryDelayMs(consecutiveFailures)
          );
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
