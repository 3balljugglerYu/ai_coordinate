import { NextRequest, NextResponse } from "next/server";
import {
  extractImagesFromGeminiResponse,
  type GeminiResponse,
} from "@/features/generation/lib/nanobanana";
import {
  ALLOWED_IMAGE_MIME_TYPE_SET,
  MAX_IMAGE_BYTES,
} from "@/features/i2i-poc/shared/image-constraints";
import { getPublishedStylePresetForGeneration } from "@/features/style-presets/lib/style-preset-repository";
import { STYLE_GENERATION_IMAGE_SIZE, STYLE_GENERATION_MODEL } from "@/features/style/lib/constants";
import {
  buildStyleAttemptReinforcementPrefix,
  buildStyleGenerationPrompt,
} from "@/shared/generation/style-prompts";
import { recordStyleUsageEvent } from "@/features/style/lib/style-usage-events";
import {
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
import type { SourceImageType } from "@/shared/generation/prompt-core";
import type { StyleUsageAuthState } from "@/features/style/lib/style-usage-events";
import { buildStyleSignupPath } from "@/features/auth/lib/signup-source";

const GEMINI_TIMEOUT_MS = 35_000;
const MAX_RETRYABLE_ATTEMPTS = 2;
const RETRYABLE_NO_IMAGE_FINISH_REASONS = new Set([
  "MALFORMED_FUNCTION_CALL",
]);

type FetchFn = typeof fetch;

interface StyleGenerateRouteDependencies {
  fetchFn?: FetchFn;
  geminiApiKey?: string;
  getUserFn?: typeof getUser;
  getPublishedStylePresetForGenerationFn?: (
    styleId: string
  ) => Promise<{
    id: string;
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
}

interface GeminiErrorPayload {
  error?: {
    message?: string;
  };
}

type GeminiContentPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

function getFile(entry: FormDataEntryValue | null): File | null {
  if (!(entry instanceof File)) {
    return null;
  }
  return entry;
}

function getFinishReasons(payload: GeminiResponse | null): string[] {
  if (!payload?.candidates || payload.candidates.length === 0) {
    return [];
  }

  const reasons = payload.candidates
    .map((candidate) => candidate.finishReason?.trim())
    .filter((reason): reason is string => Boolean(reason));

  return Array.from(new Set(reasons));
}

function isSafetyBlockedResponse(payload: GeminiResponse | null): boolean {
  if (!payload) {
    return false;
  }

  const withPromptFeedback = payload as GeminiResponse & {
    promptFeedback?: { blockReason?: string };
  };

  if (typeof withPromptFeedback.promptFeedback?.blockReason === "string") {
    return true;
  }

  if (!payload.candidates || payload.candidates.length === 0) {
    return false;
  }

  return payload.candidates.some((candidate) => {
    const finishReason = candidate.finishReason?.toUpperCase();
    return finishReason === "SAFETY";
  });
}

function shouldRetryNoImageResponse(payload: GeminiResponse | null): boolean {
  const finishReasons = getFinishReasons(payload);
  return finishReasons.some((reason) =>
    RETRYABLE_NO_IMAGE_FINISH_REASONS.has(reason)
  );
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

async function toInlineData(file: File): Promise<GeminiContentPart> {
  const arrayBuffer = await file.arrayBuffer();
  const data = Buffer.from(arrayBuffer).toString("base64");
  return {
    inline_data: {
      mime_type: file.type,
      data,
    },
  };
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
      "Style generate route: failed to record rate-limited usage event",
      error
    );
  }
}

async function recordStyleGenerateAttemptEvent(params: {
  recordStyleUsageEventFn: typeof recordStyleUsageEvent;
  userId: string | null;
  authState: StyleUsageAuthState;
  styleId: string;
}) {
  try {
    await params.recordStyleUsageEventFn({
      userId: params.userId,
      authState: params.authState,
      eventType: "generate_attempt",
      styleId: params.styleId,
    });
  } catch (error) {
    console.error(
      "Style generate route: failed to record generate attempt usage event",
      error
    );
  }
}

export async function postStyleGenerateRoute(
  request: NextRequest,
  dependencies: StyleGenerateRouteDependencies = {}
) {
  const locale = getRouteLocale(request);
  const copy = (await getAllMessages(locale)).style;
  let reservation: StyleGenerateAttemptReservation | null = null;
  const releaseRateLimitAttemptFn =
    dependencies.releaseRateLimitAttemptFn ??
    releaseStyleGenerateRateLimitAttempt;

  try {
    const getUserFn = dependencies.getUserFn ?? getUser;
    const fetchFn = dependencies.fetchFn ?? fetch;
    const getPublishedStylePresetForGenerationFn =
      dependencies.getPublishedStylePresetForGenerationFn ??
      getPublishedStylePresetForGeneration;
    const recordStyleUsageEventFn =
      dependencies.recordStyleUsageEventFn ?? recordStyleUsageEvent;
    const checkAndConsumeRateLimitFn =
      dependencies.checkAndConsumeRateLimitFn ??
      checkAndConsumeStyleGenerateRateLimit;

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
          "Style generate route: failed to release reserved attempt",
          error
        );
      }
    };

    const user = await getUserFn();
    const authState: StyleUsageAuthState = user ? "authenticated" : "guest";

    const geminiApiKey =
      dependencies.geminiApiKey ?? process.env.GEMINI_API_KEY?.trim();
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured." },
        { status: 500 }
      );
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

    let rateLimitResult: StyleGenerateRateLimitResult;
    try {
      rateLimitResult = await checkAndConsumeRateLimitFn({
        request,
        userId: user?.id ?? null,
        styleId,
      });
      reservation = rateLimitResult.allowed
        ? rateLimitResult.reservation ?? null
        : null;
    } catch (error) {
      console.error(
        "Style generate route: failed to verify guest rate limit",
        error
      );
      return jsonError(
        copy.guestRateLimitCheckFailed,
        "STYLE_RATE_LIMIT_CHECK_FAILED",
        500
      );
    }

    if (!rateLimitResult.allowed) {
      if (rateLimitResult.reason === "guest_short") {
        await recordStyleRateLimitedEvent({
          recordStyleUsageEventFn,
          userId: user?.id ?? null,
          authState,
          styleId,
        });
        return NextResponse.json(
          {
            error: copy.guestRateLimitShort,
            errorCode: "STYLE_RATE_LIMIT_SHORT",
            showRateLimitDialog: true,
          },
          { status: 429 }
        );
      }

      if (rateLimitResult.reason === "guest_daily") {
        await recordStyleRateLimitedEvent({
          recordStyleUsageEventFn,
          userId: user?.id ?? null,
          authState,
          styleId,
        });
        return NextResponse.json(
          {
            error: copy.guestRateLimitDaily,
            errorCode: "STYLE_RATE_LIMIT_DAILY",
            signupCta: true,
            signupPath: buildStyleSignupPath(),
          },
          { status: 429 }
        );
      }

      await recordStyleRateLimitedEvent({
        recordStyleUsageEventFn,
        userId: user?.id ?? null,
        authState,
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

    if (authState === "guest") {
      await recordStyleGenerateAttemptEvent({
        recordStyleUsageEventFn,
        userId: null,
        authState,
        styleId,
      });
    }

    const basePromptText = buildStyleGenerationPrompt({
      stylingPrompt: preset.stylingPrompt,
      backgroundPrompt: preset.backgroundPrompt,
      backgroundChange,
      sourceImageType,
    });
    const imagePart = await toInlineData(uploadImage);

    for (let attempt = 1; attempt <= MAX_RETRYABLE_ATTEMPTS; attempt += 1) {
      const reinforcementPrefix = buildStyleAttemptReinforcementPrefix(attempt);
      const parts: GeminiContentPart[] = [
        { text: `${reinforcementPrefix}${basePromptText}` },
        imagePart,
      ];

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), GEMINI_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetchFn(
          `https://generativelanguage.googleapis.com/v1beta/models/${STYLE_GENERATION_MODEL}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiApiKey,
            },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                candidateCount: 1,
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig: {
                  imageSize: STYLE_GENERATION_IMAGE_SIZE,
                },
              },
            }),
            signal: abortController.signal,
          }
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          await releaseReservedAttempt("timeout");
          return jsonError(copy.requestTimedOut, "STYLE_TIMEOUT", 504);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }

      const responsePayload = (await response.json().catch(() => null)) as
        | GeminiResponse
        | GeminiErrorPayload
        | null;
      const geminiPayload = (responsePayload ?? null) as GeminiResponse | null;

      if (!response.ok) {
        const apiErrorMessage =
          responsePayload &&
          typeof responsePayload === "object" &&
          "error" in responsePayload &&
          typeof responsePayload.error?.message === "string"
            ? responsePayload.error.message
            : "Gemini API request failed.";

        if (
          isSafetyBlockedResponse(geminiPayload) ||
          /safety|blocked|block_reason|policy|prohibited/i.test(apiErrorMessage)
        ) {
          return jsonError(copy.safetyBlocked, "STYLE_SAFETY_BLOCKED", 400);
        }

        if (response.status >= 500) {
          await releaseReservedAttempt("upstream_error");
        }

        return NextResponse.json(
          { error: apiErrorMessage },
          { status: response.status }
        );
      }

      if (isSafetyBlockedResponse(geminiPayload)) {
        return jsonError(copy.safetyBlocked, "STYLE_SAFETY_BLOCKED", 400);
      }

      const images = extractImagesFromGeminiResponse(
        (geminiPayload ?? {}) as GeminiResponse
      );

      if (images.length > 0) {
        const firstImage = images[0];
        try {
          await recordStyleUsageEventFn({
            userId: user?.id ?? null,
            authState,
            eventType: "generate",
            styleId,
          });
        } catch (error) {
          console.error("Style generate route: failed to record usage event", error);
        }
        return NextResponse.json({
          imageDataUrl: `data:${firstImage.mimeType};base64,${firstImage.data}`,
          mimeType: firstImage.mimeType,
        });
      }

      const finishReasons = getFinishReasons(geminiPayload);
      const shouldRetry =
        attempt < MAX_RETRYABLE_ATTEMPTS &&
        shouldRetryNoImageResponse(geminiPayload);

      if (shouldRetry) {
        console.warn("Style generate route: retrying after no-image response", {
          attempt,
          finishReasons,
        });
        continue;
      }

      const finishReasonText =
        finishReasons.length > 0 ? `（finishReason: ${finishReasons.join(", ")}）` : "";

      console.warn("Style generate route: no image part in Gemini response", {
        finishReasons,
      });
      await releaseReservedAttempt("no_image_generated");

      return NextResponse.json(
        {
          error: copy.noImageGenerated.replace(
            "{finishReasonText}",
            finishReasonText
          ),
          errorCode: "STYLE_NO_IMAGE_GENERATED",
        },
        { status: 502 }
      );
    }

    return jsonError(copy.generationFailed, "STYLE_GENERATION_FAILED", 502);
  } catch (error) {
    console.error("Style generate route error", error);
    if (reservation) {
      try {
        await releaseRateLimitAttemptFn({
          reservation,
          reason: "infra_error",
        });
      } catch (releaseError) {
        console.error(
          "Style generate route: failed to release reserved attempt after internal error",
          releaseError
        );
      }
    }
    return jsonError(copy.internalError, "STYLE_INTERNAL_ERROR", 500);
  }
}

export const styleGenerateRouteHandlers = {
  postStyleGenerateRoute,
};
