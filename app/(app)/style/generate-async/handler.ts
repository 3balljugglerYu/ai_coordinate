import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_IMAGE_MIME_TYPE_SET,
  MAX_IMAGE_BYTES,
} from "@/features/i2i-poc/shared/image-constraints";
import { getPublishedStylePresetForGeneration } from "@/features/style-presets/lib/style-preset-repository";
import { STYLE_GENERATION_MODEL } from "@/features/style/lib/constants";
import { recordStyleUsageEvent } from "@/features/style/lib/style-usage-events";
import {
  attachStyleGenerateRateLimitReservationToJob,
  checkAndConsumeStyleGenerateRateLimit,
  releaseStyleGenerateRateLimitAttempt,
  type StyleAttemptReleaseReason,
  type StyleGenerateAttemptReservation,
  type StyleGenerateRateLimitResult,
} from "@/features/style/lib/style-rate-limit";
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
  backgroundChangeToBackgroundMode,
  normalizeModelName,
} from "@/features/generation/types";
import { getPercoinCost } from "@/features/generation/lib/model-config";
import { buildOneTapStyleGenerationMetadata } from "@/shared/generation/one-tap-style-metadata";
import type { SourceImageType } from "@/shared/generation/prompt-core";
import { buildStyleGenerationPrompt } from "@/shared/generation/style-prompts";
import type { StyleUsageAuthState } from "@/features/style/lib/style-usage-events";

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
  checkAndConsumeRateLimitFn?: (params: {
    request: NextRequest;
    userId: string | null;
    styleId: string;
  }) => Promise<StyleGenerateRateLimitResult>;
  releaseRateLimitAttemptFn?: (params: {
    reservation: StyleGenerateAttemptReservation | null | undefined;
    reason: StyleAttemptReleaseReason;
  }) => Promise<boolean>;
  attachReservationToJobFn?: (params: {
    reservation: StyleGenerateAttemptReservation | null | undefined;
    jobId: string;
  }) => Promise<boolean>;
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

async function recordStyleRateLimitedEvent(params: {
  recordStyleUsageEventFn: typeof recordStyleUsageEvent;
  userId: string | null;
  authState: StyleUsageAuthState;
  styleId: string;
}) {
  try {
    await params.recordStyleUsageEventFn({
      userId: params.userId,
      authState: params.authState,
      eventType: "rate_limited",
      styleId: params.styleId,
    });
  } catch (error) {
    console.error(
      "Style async generate route: failed to record rate-limited usage event",
      error
    );
  }
}

export async function postStyleGenerateAsyncRoute(
  request: NextRequest,
  dependencies: StyleGenerateAsyncRouteDependencies = {}
) {
  const locale = getRouteLocale(request);
  const copy = (await getAllMessages(locale)).style;
  let reservation: StyleGenerateAttemptReservation | null = null;
  const releaseRateLimitAttemptFn =
    dependencies.releaseRateLimitAttemptFn ??
    releaseStyleGenerateRateLimitAttempt;

  try {
    const getUserFn = dependencies.getUserFn ?? getUser;
    const jobRepository =
      dependencies.jobRepository ?? createAsyncGenerationJobRepository();
    const invokeImageWorkerFn =
      dependencies.invokeImageWorkerFn ?? defaultInvokeImageWorker;
    const getPublishedStylePresetForGenerationFn =
      dependencies.getPublishedStylePresetForGenerationFn ??
      getPublishedStylePresetForGeneration;
    const recordStyleUsageEventFn =
      dependencies.recordStyleUsageEventFn ?? recordStyleUsageEvent;
    const checkAndConsumeRateLimitFn =
      dependencies.checkAndConsumeRateLimitFn ??
      checkAndConsumeStyleGenerateRateLimit;
    const attachReservationToJobFn =
      dependencies.attachReservationToJobFn ??
      attachStyleGenerateRateLimitReservationToJob;

    const releaseReservedAttempt = async (
      reason: StyleAttemptReleaseReason
    ) => {
      if (!reservation) {
        return;
      }

      try {
        await releaseRateLimitAttemptFn({
          reservation,
          reason,
        });
      } catch (error) {
        console.error(
          "Style async generate route: failed to release reserved attempt",
          error
        );
      }
    };

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

    const rateLimitResult = await checkAndConsumeRateLimitFn({
      request,
      userId: user.id,
      styleId,
    });
    const isPaidGeneration =
      !rateLimitResult.allowed &&
      rateLimitResult.reason === "authenticated_daily";
    reservation = rateLimitResult.allowed
      ? rateLimitResult.reservation ?? null
      : null;

    if (!rateLimitResult.allowed && !isPaidGeneration) {
      await recordStyleRateLimitedEvent({
        recordStyleUsageEventFn,
        userId: user.id,
        authState: "authenticated",
        styleId,
      });
      return NextResponse.json(
        {
          error: copy.authenticatedRateLimitDaily,
          errorCode: "STYLE_RATE_LIMIT_AUTHENTICATED_DAILY",
        },
        { status: 429 }
      );
    }

    if (isPaidGeneration) {
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
      const percoinCost = getPercoinCost(STYLE_GENERATION_MODEL);

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
      console.error("Style async generate route: failed to upload source image", uploadError);
      await releaseReservedAttempt("upload_failed");
      return jsonError(
        copy.styleImageReadFailed,
        "STYLE_SOURCE_UPLOAD_FAILED",
        500
      );
    }

    const inputImageUrl = jobRepository.getSourceImagePublicUrl(uploadData.path);

    const jobData: ImageJobCreateInput = {
      user_id: user.id,
      prompt_text: prompt,
      input_image_url: inputImageUrl,
      source_image_stock_id: null,
      source_image_type: sourceImageType,
      generation_type: "one_tap_style",
      model: normalizeModelName(STYLE_GENERATION_MODEL),
      background_mode: backgroundChangeToBackgroundMode(backgroundChange),
      background_change: backgroundChange,
      generation_metadata: buildOneTapStyleGenerationMetadata(
        preset,
        isPaidGeneration ? "paid" : "free",
        {
          reservedAttemptId:
            reservation?.authState === "authenticated"
              ? reservation.attemptId
              : null,
        }
      ),
      status: "queued",
      processing_stage: "queued",
      attempts: 0,
    };

    const { data: job, error: insertError } =
      await jobRepository.createImageJob(jobData);

    if (insertError || !job) {
      console.error("Style async generate route: failed to create job", insertError);
      await releaseReservedAttempt("job_create_failed");
      return jsonError(copy.generationFailed, "STYLE_JOB_CREATE_FAILED", 500);
    }

    try {
      await attachReservationToJobFn({
        reservation,
        jobId: job.id,
      });
    } catch (error) {
      console.error(
        "Style async generate route: failed to attach reserved attempt to job",
        error
      );
    }

    const { error: queueError } =
      await jobRepository.sendImageJobQueueMessage(job.id);

    if (queueError) {
      console.error("Style async generate route: failed to enqueue job", queueError);
      await releaseReservedAttempt("queue_failed");
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
    if (reservation) {
      try {
        await releaseRateLimitAttemptFn({
          reservation,
          reason: "infra_error",
        });
      } catch (releaseError) {
        console.error(
          "Style async generate route: failed to release reserved attempt after internal error",
          releaseError
        );
      }
    }
    return jsonError(copy.internalError, "STYLE_ASYNC_INTERNAL_ERROR", 500);
  }
}

export const styleGenerateAsyncRouteHandlers = {
  postStyleGenerateAsyncRoute,
};
