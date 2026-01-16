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
 * 非同期画像生成ステータスをポーリングで監視
 */
export async function pollGenerationStatus(
  jobId: string,
  options: {
    interval?: number; // ポーリング間隔（ミリ秒、デフォルト: 2000）
    timeout?: number; // タイムアウト（ミリ秒、デフォルト: 300000 = 5分）
    onStatusUpdate?: (status: AsyncGenerationStatus) => void; // ステータス更新時のコールバック
  } = {}
): Promise<AsyncGenerationStatus> {
  const { interval = 2000, timeout = 300000, onStatusUpdate } = options;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        // タイムアウトチェック
        if (Date.now() - startTime > timeout) {
          reject(new Error("ポーリングがタイムアウトしました"));
          return;
        }

        const status = await getGenerationStatus(jobId);
        
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
        setTimeout(poll, interval);
      } catch (error) {
        reject(error);
      }
    };

    // 初回ポーリングを開始
    poll();
  });
}
