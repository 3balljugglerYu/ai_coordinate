import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_IMAGE_MIME_TYPE_SET,
  MAX_IMAGE_BYTES,
} from "@/features/i2i-poc/shared/image-constraints";
import { getPublishedStylePresetForGeneration } from "@/features/style-presets/lib/style-preset-repository";
import { STYLE_GENERATION_MODEL } from "@/features/style/lib/constants";
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
import {
  GUEST_AUTH_FORBIDDEN,
  dispatchGuestImageGeneration,
  parseGuestModelInput,
  shouldReleaseReservationFor,
  type DispatchGuestImageGenerationResult,
} from "@/features/generation/lib/guest-generate";
import {
  callOpenAIImageEdit,
} from "@/features/generation/lib/openai-image";
import {
  isOpenAIImageModel,
  normalizeModelName,
  type GeminiModel,
} from "@/features/generation/types";
import { getAllMessages } from "@/i18n/messages";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getUser } from "@/lib/auth";
import type { SourceImageType } from "@/shared/generation/prompt-core";
import type { StyleUsageAuthState } from "@/features/style/lib/style-usage-events";
import { buildStyleSignupPath } from "@/features/auth/lib/signup-source";

const MAX_RETRYABLE_ATTEMPTS = 2;

type FetchFn = typeof fetch;

interface StyleGenerateRouteDependencies {
  fetchFn?: FetchFn;
  geminiApiKey?: string;
  openaiApiKey?: string;
  /**
   * テスト用 OpenAI クライアント差し替え (gpt-image-2-low が選ばれた場合のみ呼ばれる)
   */
  openaiClient?: typeof callOpenAIImageEdit;
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
    const openaiClient = dependencies.openaiClient ?? callOpenAIImageEdit;
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

    // UCL-014 / ADR-007: 認証済みユーザーは guest sync ルートを直叩きできない。
    // フロントは authState で経路を切り替えるため通常はここに到達しないが、
    // 課金抜け / 利用制限抜けを防ぐためサーバー側で必ず弾く。
    if (user) {
      return jsonError(
        copy.guestRouteAuthForbidden,
        GUEST_AUTH_FORBIDDEN.errorCode,
        403
      );
    }
    const authState: StyleUsageAuthState = "guest";

    const geminiApiKey =
      dependencies.geminiApiKey ?? process.env.GEMINI_API_KEY?.trim();
    const openaiApiKey =
      dependencies.openaiApiKey ?? process.env.OPENAI_API_KEY?.trim();
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

    // model は Phase 5 でフロントから明示的に送られるようになる。それまでは未送信が多数。
    // - 未送信 → STYLE_GENERATION_MODEL の正規化結果（gemini-3.1-flash-image-preview-512）
    // - 送信あり → guest 許可 whitelist で検証。許可外なら 400。
    const modelEntry = formData.get("model");
    let model: GeminiModel;
    if (typeof modelEntry === "string" && modelEntry.length > 0) {
      const parsed = parseGuestModelInput(modelEntry);
      if (!parsed) {
        return jsonError(
          copy.guestModelNotAllowed,
          "GUEST_MODEL_NOT_ALLOWED",
          400
        );
      }
      model = parsed;
    } else {
      model = normalizeModelName(STYLE_GENERATION_MODEL);
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

    if (!geminiApiKey && !isOpenAIImageModel(model)) {
      return jsonError(
        copy.guestUpstreamUnavailable,
        "STYLE_UPSTREAM_UNAVAILABLE",
        500
      );
    }
    if (!openaiApiKey && isOpenAIImageModel(model)) {
      return jsonError(
        copy.guestUpstreamUnavailable,
        "STYLE_UPSTREAM_UNAVAILABLE",
        500
      );
    }

    let rateLimitResult: StyleGenerateRateLimitResult;
    try {
      rateLimitResult = await checkAndConsumeRateLimitFn({
        request,
        userId: null,
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
          userId: null,
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
          userId: null,
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

      // UCL-010: ゲスト識別子（IP / Cookie）が取れないと無制限利用を許してしまうため
      // 明示的に拒否する。利用回数は消費しない（reserve 自体に到達しないため）。
      if (rateLimitResult.reason === "missing_identifier") {
        return jsonError(
          copy.guestRateLimitCheckFailed,
          "STYLE_GUEST_IDENTIFIER_UNAVAILABLE",
          400
        );
      }

      await recordStyleRateLimitedEvent({
        recordStyleUsageEventFn,
        userId: null,
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

    let lastDispatchResult: DispatchGuestImageGenerationResult | null = null;
    for (let attempt = 1; attempt <= MAX_RETRYABLE_ATTEMPTS; attempt += 1) {
      const reinforcementPrefix = buildStyleAttemptReinforcementPrefix(attempt);
      const promptText = `${reinforcementPrefix}${basePromptText}`;

      const dispatchResult = await dispatchGuestImageGeneration({
        model,
        promptText,
        uploadImage,
        geminiApiKey: geminiApiKey ?? "",
        openaiApiKey,
        fetchFn,
        openaiClient,
      });
      lastDispatchResult = dispatchResult;

      if (dispatchResult.kind === "success") {
        try {
          await recordStyleUsageEventFn({
            userId: null,
            authState,
            eventType: "generate",
            styleId,
          });
        } catch (error) {
          console.error("Style generate route: failed to record usage event", error);
        }
        return NextResponse.json({
          imageDataUrl: dispatchResult.imageDataUrl,
          mimeType: dispatchResult.mimeType,
        });
      }

      if (dispatchResult.kind === "safety_blocked") {
        return jsonError(copy.safetyBlocked, "STYLE_SAFETY_BLOCKED", 400);
      }

      if (dispatchResult.kind === "timeout") {
        await releaseReservedAttempt("timeout");
        return jsonError(copy.requestTimedOut, "STYLE_TIMEOUT", 504);
      }

      if (dispatchResult.kind === "upstream_error") {
        if (dispatchResult.status >= 500) {
          await releaseReservedAttempt("upstream_error");
        }
        return NextResponse.json(
          { error: dispatchResult.message },
          { status: dispatchResult.status }
        );
      }

      if (dispatchResult.kind === "openai_provider_error") {
        console.error(
          "Style generate route: OpenAI provider error",
          dispatchResult.message
        );
        await releaseReservedAttempt("infra_error");
        return jsonError(
          copy.guestUpstreamUnavailable,
          "STYLE_UPSTREAM_UNAVAILABLE",
          502
        );
      }

      if (dispatchResult.kind === "user_input_error") {
        // UCL-011c: validateGuestImageInput を後付けで足してもここに来るケースがあり得るので
        // 念のため。試行は consume しない。
        return jsonError(
          dispatchResult.message,
          "STYLE_INVALID_UPLOAD_IMAGE",
          400
        );
      }

      // no_image
      if (
        dispatchResult.retryable &&
        attempt < MAX_RETRYABLE_ATTEMPTS
      ) {
        console.warn("Style generate route: retrying after no-image response", {
          attempt,
          finishReasons: dispatchResult.finishReasons,
        });
        continue;
      }

      const finishReasonText =
        dispatchResult.finishReasons.length > 0
          ? `（finishReason: ${dispatchResult.finishReasons.join(", ")}）`
          : "";
      console.warn("Style generate route: no image part in Gemini response", {
        finishReasons: dispatchResult.finishReasons,
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

    // ループを抜けた = リトライ上限に達したのに success にも分岐確定エラーにも到達しなかったケース。
    // 通常起き得ないはずだが、保険として 502 で終わらせる。
    if (lastDispatchResult) {
      console.warn(
        "Style generate route: exhausted retries without resolving",
        { lastKind: lastDispatchResult.kind }
      );
      if (shouldReleaseReservationFor(lastDispatchResult)) {
        await releaseReservedAttempt("upstream_error");
      }
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
