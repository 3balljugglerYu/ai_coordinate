import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_IMAGE_MIME_TYPE_SET,
  MAX_IMAGE_BYTES,
} from "@/features/i2i-poc/shared/image-constraints";
import { getPublishedStylePresetForGeneration } from "@/features/style-presets/lib/style-preset-repository";
import { STYLE_GENERATION_MODEL } from "@/features/style/lib/constants";
import { recordStyleUsageEvent } from "@/features/style/lib/style-usage-events";
import {
  checkAndConsumeStyleGenerateRateLimit,
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
import { buildOneTapStyleGenerationMetadata } from "@/shared/generation/one-tap-style-metadata";
import type { SourceImageType } from "@/shared/generation/prompt-core";
import type { StyleUsageAuthState } from "@/features/style/lib/style-usage-events";

const STYLE_PROMPT_BASE_PREFIX = `CRITICAL INSTRUCTION: This is an Image-to-Image task based on \`image_0.png\`. Strictly follow these steps:

1. Strict Filtering: DO NOT describe or generate any body parts, clothing, or items that are not visible in \`image_0.png\`. If a part is not in the original frame, omit its description entirely.

2. Pose Preservation: Maintain the exact facial features, hair style, and pose of the person in \`image_0.png\`.`;
const STYLE_PROMPT_ILLUSTRATION_SUFFIX =
  "Maintain the exact artistic style, brushwork, and original composition.";
const STYLE_PROMPT_REAL_SUFFIX =
  "Generate a photorealistic result based on the uploaded photo. Preserve the original camera angle, framing, realistic lighting, and composition. Do not introduce painterly or illustrated rendering.";
const STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX =
  "Keep the entire original background unchanged as much as possible. Do not replace, redesign, or restyle the background.";
const STYLE_PROMPT_CHANGE_BACKGROUND_SUFFIX =
  "You may restyle the background within the existing framing so it complements the selected outfit. Preserve the camera angle, crop, composition, pose, facial features, and character identity.";

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

function buildGenerationPrompt(params: {
  stylingPrompt: string;
  backgroundPrompt: string | null;
  backgroundChange: boolean;
  sourceImageType: SourceImageType;
}): string {
  const promptSuffix =
    params.sourceImageType === "real"
      ? STYLE_PROMPT_REAL_SUFFIX
      : STYLE_PROMPT_ILLUSTRATION_SUFFIX;
  const backgroundInstruction = params.backgroundChange
    ? STYLE_PROMPT_CHANGE_BACKGROUND_SUFFIX
    : STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX;
  const promptSections = [
    STYLE_PROMPT_BASE_PREFIX,
    promptSuffix,
    backgroundInstruction,
    `Styling Direction:\n${params.stylingPrompt}`,
  ];

  if (params.backgroundChange && params.backgroundPrompt) {
    promptSections.push(`Background Direction:\n${params.backgroundPrompt}`);
  }

  return promptSections.join("\n\n");
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

    if (!rateLimitResult.allowed) {
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

    const prompt = buildGenerationPrompt({
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
      generation_metadata: buildOneTapStyleGenerationMetadata(preset, "free"),
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

    const supabaseUrl = dependencies.supabaseUrl ?? env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      invokeImageWorkerFn(`${supabaseUrl}/functions/v1/image-gen-worker`);
    }

    if (queueError) {
      console.error("Style async generate route: failed to enqueue job", queueError);
      return NextResponse.json(
        {
          jobId: job.id,
          status: job.status,
          warning: "queue_delayed",
        },
        { status: 202 }
      );
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
