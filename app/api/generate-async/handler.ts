import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { generationRequestSchema, getSafeExtensionFromMimeType } from "@/features/generation/lib/schema";
import { convertHeicBase64ToJpeg, isHeicImage } from "@/features/generation/lib/heic-converter";
import { env } from "@/lib/env";
import type { ImageJobCreateInput } from "@/features/generation/lib/job-types";
import { getPercoinCost } from "@/features/generation/lib/model-config";
import {
  createAsyncGenerationJobRepository,
  type AsyncGenerationJobRepository,
} from "@/features/generation/lib/async-generation-job-repository";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getGenerationRouteCopy } from "@/features/generation/lib/route-copy";
import { DEFAULT_LOCALE } from "@/i18n/config";

const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;

interface GenerateAsyncRouteDependencies {
  getUserFn?: typeof getUser;
  jobRepository?: AsyncGenerationJobRepository;
  invokeImageWorkerFn?: (edgeFunctionUrl: string) => void;
  supabaseUrl?: string;
}

function logGenerateAsyncTiming(
  event: string,
  payload: Record<string, string | number | null>
) {
  console.info(`[Generate Async Timing] ${event}`, payload);
}

function getUnexpectedGenerateAsyncCopy(request: NextRequest) {
  try {
    return getGenerationRouteCopy(getRouteLocale(request));
  } catch {
    return getGenerationRouteCopy(DEFAULT_LOCALE);
  }
}

function defaultInvokeImageWorker(edgeFunctionUrl: string) {
  try {
    fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }).catch((error) => {
      // Edge Functionの呼び出し自体が失敗した場合のログを強化
      // 非同期処理のため、ここではAPIのレスポンスには影響を与えませんが、
      // ログを詳細化することで、運用上の問題発見に役立ちます。
      console.error("Failed to invoke Edge Function:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        edgeFunctionUrl,
      });
    });
  } catch (error) {
    console.error("Failed to initiate Edge Function call:", error);
  }
}

/**
 * 非同期画像生成ジョブ投入API
 * ジョブを`image_jobs`テーブルに作成し、Supabase Queueにメッセージを送信
 */
export async function postGenerateAsyncRoute(
  request: NextRequest,
  dependencies: GenerateAsyncRouteDependencies = {}
) {
  const copy = getGenerationRouteCopy(getRouteLocale(request));
  const routeStartedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const getUserFn = dependencies.getUserFn ?? getUser;
    const invokeImageWorkerFn =
      dependencies.invokeImageWorkerFn ?? defaultInvokeImageWorker;

    // 認証チェック
    const user = await getUserFn();
    if (!user) {
      return jsonError(copy.authRequired, "GENERATION_AUTH_REQUIRED", 401);
    }

    // リクエストボディの解析
    const body = await request.json();

    // バリデーション
    const validationResult = generationRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return jsonError(
        validationResult.error.issues[0]?.message ?? copy.invalidRequest,
        "GENERATION_INVALID_REQUEST",
        400
      );
    }

    const {
      prompt,
      sourceImageBase64,
      sourceImageMimeType,
      sourceImageStockId,
      sourceImageType,
      backgroundMode,
      generationType,
      model,
    } = validationResult.data;

    const jobRepository =
      dependencies.jobRepository ?? createAsyncGenerationJobRepository();
    const creditBalanceStartedAt = Date.now();
    const creditBalancePromise = jobRepository.getUserCreditBalance(user.id);

    // sourceImageBase64またはsourceImageStockIdがある場合、input_image_urlを設定
    let inputImageUrl: string | null = null;
    let stockId: string | null = null;
    const sourceImageProcessingStartedAt = Date.now();

    if (sourceImageStockId) {
      // ストック画像IDがある場合、ストック画像のURLを取得
      try {
        const { data: stock, error: stockError } =
          await jobRepository.findSourceImageStock(sourceImageStockId, user.id);

        if (stockError || !stock) {
          console.error("Failed to fetch source image stock:", stockError);
          return jsonError(copy.sourceStockNotFound, "GENERATION_SOURCE_STOCK_NOT_FOUND", 404);
        }

        inputImageUrl = stock.image_url;
        stockId = stock.id;
      } catch (error) {
        console.error("Error fetching source image stock:", error);
        return jsonError(copy.sourceStockFetchFailed, "GENERATION_SOURCE_STOCK_FETCH_FAILED", 500);
      }
    } else if (sourceImageBase64 && sourceImageMimeType) {
      // sourceImageBase64がある場合、一時的にStorageにアップロードしてURLを取得
      try {
        // Base64データを取得（data:プレフィックスを除去）
        let base64Data = sourceImageBase64.replace(/^data:.+;base64,/, "");
        let mimeType = sourceImageMimeType;
        let extension: string;

        // 過大な入力画像を早期に拒否（base64長からデコード後バイト数を推定）
        const estimatedBytes = Math.floor((base64Data.length * 3) / 4);
        if (estimatedBytes > MAX_SOURCE_IMAGE_BYTES) {
          return jsonError(copy.sourceImageTooLarge, "GENERATION_SOURCE_IMAGE_TOO_LARGE", 400);
        }

        // HEIC/HEIF形式の場合はJPEGに変換
        if (isHeicImage(sourceImageMimeType)) {
          try {
            const converted = await convertHeicBase64ToJpeg(base64Data, 0.9);
            base64Data = converted.base64;
            mimeType = converted.mimeType;
            extension = "jpg";
          } catch (conversionError) {
            console.error("Failed to convert HEIC image:", conversionError);
            return jsonError(copy.heicConversionFailed, "GENERATION_HEIC_CONVERSION_FAILED", 400);
          }
        } else {
          // HEIC/HEIF以外の場合は、安全に拡張子を取得
          extension = getSafeExtensionFromMimeType(sourceImageMimeType);
        }

        // Base64をBufferに変換
        const buffer = Buffer.from(base64Data, "base64");

        // 一時ファイル名を生成
        // パストラバーサル攻撃を防ぐため、MIMEタイプから安全に拡張子を取得
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        // ファイル名のパス要素も安全にする（user.idはUUIDで検証済み、timestampとrandomStrは数値/英数字のみ）
        const fileName = `temp/${user.id}/${timestamp}-${randomStr}.${extension}`;

        // Storageにアップロード（generated-imagesバケットのtemp/フォルダに保存）
        // 注意: HEIC変換後の場合は、変換後のMIMEタイプ（JPEG）を使用
        const { data: uploadData, error: uploadError } =
          await jobRepository.uploadSourceImage(fileName, buffer, mimeType);

        if (uploadError || !uploadData) {
          console.error("Failed to upload source image:", uploadError);
          return jsonError(copy.sourceUploadFailed, "GENERATION_SOURCE_UPLOAD_FAILED", 500);
        }

        // 公開URLを取得
        inputImageUrl = jobRepository.getSourceImagePublicUrl(uploadData.path);
      } catch (error) {
        console.error("Error uploading source image:", error);
        return jsonError(copy.sourceProcessFailed, "GENERATION_SOURCE_PROCESS_FAILED", 500);
      }
    }

    const sourceImageProcessingMs = Date.now() - sourceImageProcessingStartedAt;

    // 1枚分のペルコイン残高チェック
    const percoinCost = getPercoinCost(
      model || "gemini-3.1-flash-image-preview-512"
    );

    // 現在の残高を取得
    // user_idはUNIQUE制約があるため、single()を使用してデータ整合性の問題を早期検出
    const { data: creditData, error: creditError } =
      await creditBalancePromise;
    const creditBalanceMs = Date.now() - creditBalanceStartedAt;

    if (creditError || !creditData) {
      console.error("Failed to fetch user credits:", creditError);
      return jsonError(copy.balanceFetchFailed, "GENERATION_BALANCE_FETCH_FAILED", 500);
    }

    const currentBalance = creditData.balance;

    // 残高チェック
    if (currentBalance < percoinCost) {
      return jsonError(
        copy.insufficientBalance(percoinCost, currentBalance),
        "GENERATION_INSUFFICIENT_BALANCE",
        400
      );
    }

    // image_jobsテーブルにレコード作成
    const createJobStartedAt = Date.now();
    const jobData: ImageJobCreateInput = {
      user_id: user.id,
      prompt_text: prompt,
      input_image_url: inputImageUrl,
      source_image_stock_id: stockId,
      source_image_type: sourceImageType,
      generation_type: generationType || "coordinate",
      model: model || null,
      background_mode: backgroundMode,
      status: "queued",
      processing_stage: "queued",
      attempts: 0,
    };

    const { data: job, error: insertError } =
      await jobRepository.createImageJob(jobData);
    const createJobMs = Date.now() - createJobStartedAt;

    if (insertError || !job) {
      console.error("Failed to create image job:", insertError);
      return jsonError(copy.jobCreateFailed, "GENERATION_JOB_CREATE_FAILED", 500);
    }

    // Supabase Queueにメッセージ送信
    // 注意: PostgRESTはpublicとgraphql_publicスキーマのみを許可するため、
    // pgmq_public.send()の代わりにpublic.pgmq_send()ラッパー関数を使用
    const queueSendStartedAt = Date.now();
    const { error: queueError } =
      await jobRepository.sendImageJobQueueMessage(job.id);
    const queueSendMs = Date.now() - queueSendStartedAt;

    // 即時処理の起動: Edge FunctionをHTTP経由で呼び出し（非同期、エラーは無視）
    // 注意: Edge Functionは--no-verify-jwtフラグでデプロイされているため、
    // Authorizationヘッダーは不要です。Service Role Keyの漏洩リスクを避けるため、
    // 可能な限り削除を推奨します。
    const supabaseUrl = dependencies.supabaseUrl ?? env.NEXT_PUBLIC_SUPABASE_URL;

    const invokeStartedAt = Date.now();
    if (supabaseUrl) {
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/image-gen-worker`;
      invokeImageWorkerFn(edgeFunctionUrl);
    }
    const invokeMs = Date.now() - invokeStartedAt;

    // キュー送信失敗時の処理
    if (queueError) {
      console.error("Failed to send message to queue:", queueError);
      logGenerateAsyncTiming("acceptedWithQueueWarning", {
        sourceImageProcessingMs,
        creditBalanceMs,
        createJobMs,
        queueSendMs,
        invokeMs,
        totalMs: Date.now() - routeStartedAt,
      });
      // キューへの送信に失敗しても、ジョブは作成されている
      // Edge Functionの即時呼び出しも失敗している可能性がある
      // Cronジョブ（10秒ごと）が処理を拾うまで遅延する可能性があることをユーザーに通知
      return NextResponse.json(
        {
          jobId: job.id,
          status: job.status,
          warning: queueError
            ? copy.queueDelayedWarning
            : undefined,
        },
        { status: 202 }
      );
    }

    // レスポンス: ジョブIDとステータスを返却
    logGenerateAsyncTiming("accepted", {
      sourceImageProcessingMs,
      creditBalanceMs,
      createJobMs,
      queueSendMs,
      invokeMs,
      totalMs: Date.now() - routeStartedAt,
    });
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
    });
  } catch (error) {
    const copy = getUnexpectedGenerateAsyncCopy(request);

    console.error("Generate async error:", {
      requestId,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    });

    return NextResponse.json(
      {
        error: copy.generateAsyncFailed,
        errorCode: "GENERATION_ASYNC_FAILED",
        requestId,
      },
      { status: 500 }
    );
  }
}

export const generateAsyncRouteHandlers = {
  postGenerateAsyncRoute,
};
