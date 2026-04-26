import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_IMAGE_MIME_TYPE_SET,
  MAX_IMAGE_BYTES,
} from "@/features/i2i-poc/shared/image-constraints";
import { getPublishedStylePresetForGeneration } from "@/features/style-presets/lib/style-preset-repository";
import { recordStyleUsageEvent } from "@/features/style/lib/style-usage-events";
import { getAllMessages } from "@/i18n/messages";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getUser } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  createAsyncGenerationJobRepository,
  type AsyncGenerationJobRepository,
} from "@/features/generation/lib/async-generation-job-repository";
import type { ImageJobCreateInput } from "@/features/generation/lib/job-types";
import { getSafeExtensionFromMimeType } from "@/features/generation/lib/schema";
import {
  DEFAULT_GENERATION_MODEL,
  backgroundChangeToBackgroundMode,
  isKnownModelInput,
  normalizeModelName,
} from "@/features/generation/types";
import { getPercoinCost } from "@/features/generation/lib/model-config";
import { buildOneTapStyleGenerationMetadata } from "@/shared/generation/one-tap-style-metadata";
import type { SourceImageType } from "@/shared/generation/prompt-core";
import { buildStyleGenerationPrompt } from "@/shared/generation/style-prompts";

interface StyleGenerateAsyncRouteDependencies {
  getUserFn?: typeof getUser;
  jobRepository?: AsyncGenerationJobRepository;
  invokeImageWorkerFn?: (edgeFunctionUrl: string) => void;
  supabaseUrl?: string;
  getPublishedStylePresetForGenerationFn?: (
    styleId: string
  ) => Promise<{
    id: string;
    title: string;
    thumbnailImageUrl: string;
    thumbnailWidth: number;
    thumbnailHeight: number;
    hasBackgroundPrompt: boolean;
    stylingPrompt: string;
    backgroundPrompt: string | null;
  } | null>;
  recordStyleUsageEventFn?: typeof recordStyleUsageEvent;
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

function getFile(entry: FormDataEntryValue | null): File | null {
  if (!(entry instanceof File)) {
    return null;
  }
  return entry;
}

function validateImageFile(
  file: File,
  label: string,
  copy: Awaited<ReturnType<typeof getAllMessages>>["style"]
): string | null {
  const normalizedType = file.type.toLowerCase().trim();
  if (!ALLOWED_IMAGE_MIME_TYPE_SET.has(normalizedType)) {
    return copy.supportedFormatsOnly.replace("{label}", label);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return copy.imageTooLarge.replace("{label}", label);
  }
  return null;
}

function resolveSourceImageType(entry: FormDataEntryValue | null): SourceImageType {
  return entry === "real" ? "real" : "illustration";
}

function resolveBackgroundChange(entry: FormDataEntryValue | null): boolean {
  return entry === "true";
}

/**
 * /style/generate-async (Phase 5 / ADR-008 / UCL-007 / UCL-008 / UCL-016)
 *
 * - 認証必須（ゲストは /style/generate sync を使う）
 * - 旧「1 日 5 回無料」枠は廃止し、選択モデル単価で常時ペルコイン消費
 * - route handler は残高チェックと `image_jobs` 投入のみ。実減算は worker
 *   (`generation_metadata.oneTapStyle.billingMode === "paid"` 経路で実行される) に集約
 * - `model` を form から受け取り、UCL-001 の whitelist 系検証は通常モデル一覧で行う
 *   （/style 認証ユーザーは全 6 モデル選択可能）
 */
export async function postStyleGenerateAsyncRoute(
  request: NextRequest,
  dependencies: StyleGenerateAsyncRouteDependencies = {}
) {
  const locale = getRouteLocale(request);
  const copy = (await getAllMessages(locale)).style;

  try {
    const getUserFn = dependencies.getUserFn ?? getUser;
    const jobRepository =
      dependencies.jobRepository ?? createAsyncGenerationJobRepository();
    const invokeImageWorkerFn =
      dependencies.invokeImageWorkerFn ?? defaultInvokeImageWorker;
    const getPublishedStylePresetForGenerationFn =
      dependencies.getPublishedStylePresetForGenerationFn ??
      getPublishedStylePresetForGeneration;

    const user = await getUserFn();
    if (!user) {
      return jsonError(copy.authRequired, "STYLE_AUTH_REQUIRED", 401);
    }

    const formData = await request.formData();
    const styleIdEntry = formData.get("styleId");
    const styleId = typeof styleIdEntry === "string" ? styleIdEntry.trim() : "";
    const sourceImageType = resolveSourceImageType(
      formData.get("sourceImageType")
    );
    const backgroundChange = resolveBackgroundChange(
      formData.get("backgroundChange")
    );

    if (!styleId) {
      return jsonError(copy.missingStyle, "STYLE_MISSING_STYLE", 400);
    }

    // model 受け取り (Phase 5)。フロントから明示的に送られる前提だが、
    // 後方互換のため未送信なら DEFAULT_GENERATION_MODEL を使う。
    const modelEntry = formData.get("model");
    const rawModel = typeof modelEntry === "string" ? modelEntry : null;
    const model = rawModel && isKnownModelInput(rawModel)
      ? normalizeModelName(rawModel)
      : DEFAULT_GENERATION_MODEL;

    const preset = await getPublishedStylePresetForGenerationFn(styleId);
    if (!preset) {
      return jsonError(copy.invalidStylePreset, "STYLE_INVALID_STYLE", 400);
    }

    const uploadImage = getFile(formData.get("uploadImage"));
    if (!uploadImage) {
      return jsonError(
        copy.missingUploadImage,
        "STYLE_MISSING_UPLOAD_IMAGE",
        400
      );
    }

    const uploadImageError = validateImageFile(
      uploadImage,
      copy.uploadImageLabel,
      copy
    );
    if (uploadImageError) {
      return jsonError(
        uploadImageError,
        "STYLE_INVALID_UPLOAD_IMAGE",
        400
      );
    }

    if (backgroundChange && !preset.backgroundPrompt?.trim()) {
      return jsonError(
        copy.styleBackgroundPromptUnavailable,
        "STYLE_BACKGROUND_PROMPT_UNAVAILABLE",
        400
      );
    }

    // 残高チェック (Phase 5 / ADR-008)。実減算は worker。
    const percoinCost = getPercoinCost(model);
    const { data: creditData, error: creditError } =
      await jobRepository.getUserCreditBalance(user.id);

    if (creditError || !creditData) {
      console.error(
        "Style async generate route: failed to fetch user credits",
        creditError
      );
      return jsonError(
        copy.percoinBalanceFetchFailed,
        "STYLE_BALANCE_FETCH_FAILED",
        500
      );
    }

    const currentBalance = creditData.balance;
    if (currentBalance < percoinCost) {
      return jsonError(
        copy.authenticatedPaidInsufficientBalance.replace(
          "{cost}",
          String(percoinCost)
        ),
        "STYLE_INSUFFICIENT_PERCOIN_BALANCE",
        400
      );
    }

    const prompt = buildStyleGenerationPrompt({
      stylingPrompt: preset.stylingPrompt,
      backgroundPrompt: preset.backgroundPrompt,
      backgroundChange,
      sourceImageType,
    });

    const arrayBuffer = await uploadImage.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const extension = getSafeExtensionFromMimeType(uploadImage.type);
    const fileName = `temp/${user.id}/${timestamp}-${randomStr}.${extension}`;

    const { data: uploadData, error: uploadError } =
      await jobRepository.uploadSourceImage(fileName, buffer, uploadImage.type);

    if (uploadError || !uploadData) {
      console.error(
        "Style async generate route: failed to upload source image",
        uploadError
      );
      return jsonError(
        copy.styleImageReadFailed,
        "STYLE_SOURCE_UPLOAD_FAILED",
        500
      );
    }

    const inputImageUrl = jobRepository.getSourceImagePublicUrl(uploadData.path);

    // UCL-016 / ADR-008: billingMode は常に "paid"。worker はこれを見て減算する。
    const jobData: ImageJobCreateInput = {
      user_id: user.id,
      prompt_text: prompt,
      input_image_url: inputImageUrl,
      source_image_stock_id: null,
      source_image_type: sourceImageType,
      generation_type: "one_tap_style",
      model,
      background_mode: backgroundChangeToBackgroundMode(backgroundChange),
      generation_metadata: buildOneTapStyleGenerationMetadata(preset, "paid", {
        reservedAttemptId: null,
      }),
      status: "queued",
      processing_stage: "queued",
      attempts: 0,
    };

    const { data: job, error: insertError } =
      await jobRepository.createImageJob(jobData);

    if (insertError || !job) {
      console.error("Style async generate route: failed to create job", insertError);
      return jsonError(copy.generationFailed, "STYLE_JOB_CREATE_FAILED", 500);
    }

    const { error: queueError } =
      await jobRepository.sendImageJobQueueMessage(job.id);

    if (queueError) {
      console.error("Style async generate route: failed to enqueue job", queueError);
      const failedUpdate = await jobRepository.markImageJobFailed(
        job.id,
        "Queue message dispatch failed."
      );
      if (failedUpdate.error) {
        console.error(
          "Style async generate route: failed to mark queue error job as failed",
          failedUpdate.error
        );
      }
      return jsonError(copy.generationFailed, "STYLE_QUEUE_FAILED", 500);
    }

    const supabaseUrl = dependencies.supabaseUrl ?? env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      try {
        invokeImageWorkerFn(`${supabaseUrl}/functions/v1/image-gen-worker`);
      } catch (error) {
        console.error(
          "Style async generate route: failed to invoke image worker",
          error
        );
      }
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
    });
  } catch (error) {
    console.error("Style async generate route error", error);
    return jsonError(copy.internalError, "STYLE_ASYNC_INTERNAL_ERROR", 500);
  }
}

export const styleGenerateAsyncRouteHandlers = {
  postStyleGenerateAsyncRoute,
};
