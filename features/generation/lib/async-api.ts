/**
 * 非同期画像生成APIクライアント
 * 非同期画像生成ジョブの投入とステータス取得を行う
 */

import type { GenerationRequest } from "../types";

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
  resultImageUrl: string | null;
  errorMessage: string | null;
}

/**
 * 非同期画像生成ジョブを投入
 */
export async function generateImageAsync(
  request: Omit<GenerationRequest, "count">
): Promise<AsyncGenerationResponse> {
  // 画像をBase64に変換（sourceImageがある場合のみ）
  // ストック画像IDの場合は、サーバー側で処理するためBase64に変換しない
  let sourceImageBase64: string | undefined;
  let sourceImageMimeType: string | undefined;

  if (request.sourceImage) {
    const { imageToBase64 } = await import("./nanobanana");
    sourceImageBase64 = await imageToBase64(request.sourceImage);
    sourceImageMimeType = request.sourceImage.type;
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
      backgroundChange: request.backgroundChange || false,
      generationType: request.generationType || "coordinate",
      model: request.model || "gemini-2.5-flash-image",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "画像生成ジョブの投入に失敗しました");
  }

  const data: AsyncGenerationResponse = await response.json();
  return data;
}

/**
 * 非同期画像生成ステータスを取得
 */
export async function getGenerationStatus(
  jobId: string
): Promise<AsyncGenerationStatus> {
  const response = await fetch(`/api/generation-status?id=${encodeURIComponent(jobId)}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "ステータスの取得に失敗しました");
  }

  const data = await response.json();
  return {
    id: data.id,
    status: data.status,
    resultImageUrl: data.resultImageUrl || null,
    errorMessage: data.errorMessage || null,
  };
}

/**
 * 画像生成ジョブのステータス型（未完了・完了済みを含む）
 */
export interface JobStatus {
  id: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  createdAt: string;
}

/**
 * 未完了画像生成ジョブを取得
 * @param includeRecent 最近完了したジョブ（直近5分以内）も含めるかどうか
 * @returns ジョブの一覧（未完了と最近完了したジョブ）
 */
export async function getInProgressJobs(includeRecent: boolean = false): Promise<JobStatus[]> {
  const url = includeRecent
    ? "/api/generation-status/in-progress?includeRecent=true"
    : "/api/generation-status/in-progress";
  
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "ジョブの取得に失敗しました");
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
    interval?: number; // ポーリング間隔（ミリ秒、デフォルト: 2000）
    timeout?: number; // タイムアウト（ミリ秒、デフォルト: 300000 = 5分）
    onStatusUpdate?: (status: AsyncGenerationStatus) => void; // ステータス更新時のコールバック
  } = {}
): PollGenerationStatusResult {
  const { interval = 2000, timeout = 300000, onStatusUpdate } = options;
  const startTime = Date.now();
  let timeoutId: NodeJS.Timeout | null = null;
  let isStopped = false;

  const stop = () => {
    isStopped = true;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const promise = new Promise<AsyncGenerationStatus>((resolve, reject) => {
    const poll = async () => {
      // 停止された場合は処理を中断
      if (isStopped) {
        reject(new Error("ポーリングが停止されました"));
        return;
      }

      try {
        // タイムアウトチェック
        if (Date.now() - startTime > timeout) {
          reject(new Error("ポーリングがタイムアウトしました"));
          return;
        }

        const status = await getGenerationStatus(jobId);
        
        // 停止された場合は処理を中断
        if (isStopped) {
          reject(new Error("ポーリングが停止されました"));
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
        timeoutId = setTimeout(poll, interval);
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
