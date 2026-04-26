import { NextRequest, NextResponse } from "next/server";
import { GUEST_AUTH_FORBIDDEN } from "@/features/generation/lib/guest-generate";
import {
  assertGuestRequest,
  dispatchGuestImageGeneration,
  parseGuestModelInput,
  shouldReleaseReservationFor,
  validateGuestImageInput,
} from "@/features/generation/lib/guest-generate";
import {
  checkAndConsumeGuestGenerateRateLimit,
  releaseGuestGenerateRateLimitAttempt,
  type GuestAttemptReleaseReason,
  type GuestGenerateAttemptReservation,
} from "@/features/generation/lib/guest-rate-limit";
import { getGenerationRouteCopy } from "@/features/generation/lib/route-copy";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getUser } from "@/lib/auth";
import {
  BACKGROUND_MODES,
  buildPrompt,
  type BackgroundMode,
  type GenerationType,
  type SourceImageType,
} from "@/shared/generation/prompt-core";

interface CoordinateGenerateGuestRouteDependencies {
  getUserFn?: typeof getUser;
  geminiApiKey?: string;
  openaiApiKey?: string;
  fetchFn?: typeof fetch;
  openaiClient?: Parameters<
    typeof dispatchGuestImageGeneration
  >[0]["openaiClient"];
  checkAndConsumeRateLimitFn?: typeof checkAndConsumeGuestGenerateRateLimit;
  releaseRateLimitAttemptFn?: typeof releaseGuestGenerateRateLimitAttempt;
}

const ALLOWED_GENERATION_TYPES: GenerationType[] = [
  "coordinate",
  "specified_coordinate",
  "full_body",
  "chibi",
];

const PROMPT_MAX_LENGTH = 2000;

function getFile(entry: FormDataEntryValue | null): File | null {
  return entry instanceof File ? entry : null;
}

function getString(entry: FormDataEntryValue | null): string | null {
  return typeof entry === "string" ? entry : null;
}

function resolveSourceImageType(value: string | null): SourceImageType {
  return value === "real" ? "real" : "illustration";
}

function resolveBackgroundMode(value: string | null): BackgroundMode {
  if (value && (BACKGROUND_MODES as ReadonlyArray<string>).includes(value)) {
    return value as BackgroundMode;
  }
  return "keep";
}

function resolveGenerationType(value: string | null): GenerationType {
  if (value && (ALLOWED_GENERATION_TYPES as string[]).includes(value)) {
    return value as GenerationType;
  }
  return "coordinate";
}

/**
 * UCL-014 / ADR-007 に従って、認証済みユーザーがゲスト sync を直叩きしたら 403 で拒否する。
 * フロントは authState で経路を切り替えるため通常はここに到達しないが、サーバー側で必ず弾く。
 */
async function rejectIfAuthenticated(
  user: Awaited<ReturnType<typeof getUser>>,
  copy: ReturnType<typeof getGenerationRouteCopy>
): Promise<NextResponse | null> {
  const authResult = assertGuestRequest(user);
  if (authResult.kind === "auth_forbidden") {
    return jsonError(
      copy.guestRouteAuthForbidden,
      GUEST_AUTH_FORBIDDEN.errorCode,
      403
    );
  }
  return null;
}

function buildGuestSignupPath(nextPath = "/coordinate"): string {
  const params = new URLSearchParams({ next: nextPath });
  return `/signup?${params.toString()}`;
}

/**
 * /api/coordinate-generate-guest 本体。
 *
 * 認証ガード → モデル whitelist → 画像入力検証 → reserve → モデル呼び出し → 結果マッピング
 * の順で UCL-001 / 011a / 011b / 011c / 014 を満たす。生成画像は data URL 返却のみで
 * `generated_images` / `image_jobs` には保存しない（UCL-003）。
 */
export async function postCoordinateGenerateGuestRoute(
  request: NextRequest,
  dependencies: CoordinateGenerateGuestRouteDependencies = {}
) {
  const copy = getGenerationRouteCopy(getRouteLocale(request));
  let reservation: GuestGenerateAttemptReservation | null = null;
  const releaseRateLimitAttemptFn =
    dependencies.releaseRateLimitAttemptFn ??
    releaseGuestGenerateRateLimitAttempt;

  const releaseReservedAttempt = async (reason: GuestAttemptReleaseReason) => {
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
        "Coordinate guest generate route: failed to release reserved attempt",
        error
      );
    }
  };

  try {
    const getUserFn = dependencies.getUserFn ?? getUser;
    const checkAndConsumeRateLimitFn =
      dependencies.checkAndConsumeRateLimitFn ??
      checkAndConsumeGuestGenerateRateLimit;
    const geminiApiKey =
      dependencies.geminiApiKey ?? process.env.GEMINI_API_KEY?.trim();
    const openaiApiKey =
      dependencies.openaiApiKey ?? process.env.OPENAI_API_KEY?.trim();

    if (!geminiApiKey && !openaiApiKey) {
      console.error(
        "Coordinate guest generate route: neither GEMINI_API_KEY nor OPENAI_API_KEY is configured"
      );
      return jsonError(copy.guestUpstreamUnavailable, "GUEST_UPSTREAM_UNAVAILABLE", 500);
    }

    const user = await getUserFn();
    const authReject = await rejectIfAuthenticated(user, copy);
    if (authReject) {
      return authReject;
    }

    const formData = await request.formData();

    const promptRaw = getString(formData.get("prompt"));
    const promptText = (promptRaw ?? "").trim();
    if (!promptText) {
      return jsonError(copy.guestPromptMissing, "GUEST_PROMPT_MISSING", 400);
    }
    if (promptText.length > PROMPT_MAX_LENGTH) {
      return jsonError(copy.invalidRequest, "GUEST_PROMPT_TOO_LONG", 400);
    }

    const uploadImage = getFile(formData.get("uploadImage"));
    if (!uploadImage) {
      return jsonError(copy.guestImageMissing, "GUEST_IMAGE_MISSING", 400);
    }

    const modelRaw = getString(formData.get("model"));
    const model = parseGuestModelInput(modelRaw);
    if (!model) {
      // UCL-001: ゲスト許可外モデルは 400
      return jsonError(
        copy.guestModelNotAllowed,
        "GUEST_MODEL_NOT_ALLOWED",
        400
      );
    }

    const sourceImageType = resolveSourceImageType(
      getString(formData.get("sourceImageType"))
    );
    const backgroundMode = resolveBackgroundMode(
      getString(formData.get("backgroundMode"))
    );
    const generationType = resolveGenerationType(
      getString(formData.get("generationType"))
    );

    // UCL-011c: reserve 前に弾くべき入力エラー（MIME / size / GIF on OpenAI）
    const inputValidation = validateGuestImageInput({
      uploadImage,
      model,
      invalidImageMessage: copy.guestImageMissing,
      imageTooLargeMessage: copy.sourceImageTooLarge,
      gifNotSupportedByOpenAIMessage: copy.guestGifNotSupportedByOpenAI,
    });
    if (inputValidation.kind === "input_error") {
      return jsonError(
        inputValidation.message,
        inputValidation.errorCode,
        400
      );
    }

    // プロンプト構築（インジェクション対策と種類別整形は buildPrompt が担当）
    let composedPrompt: string;
    try {
      composedPrompt = buildPrompt({
        generationType,
        outfitDescription: promptText,
        backgroundMode,
        sourceImageType,
      });
    } catch (error) {
      console.warn("Coordinate guest generate route: prompt build failed", error);
      return jsonError(copy.invalidRequest, "GUEST_PROMPT_INVALID", 400);
    }

    // レート制限の reserve（IP+Cookie ハッシュで識別）
    const rateLimitResult = await checkAndConsumeRateLimitFn({
      request,
      userId: null,
      // 既存の RPC は p_style_id を取らないため、識別用のラベルとして空文字を渡す。
      // /coordinate ゲストはスタイル概念がない。
      styleId: "",
    });

    if (!rateLimitResult.allowed) {
      if (rateLimitResult.reason === "missing_identifier") {
        return jsonError(
          copy.guestIdentifierUnavailable,
          "GUEST_IDENTIFIER_UNAVAILABLE",
          400
        );
      }
      // guest_short / guest_daily / authenticated_daily いずれも 429 で
      // 「本日の上限に達しました + signup CTA」を返す。
      return NextResponse.json(
        {
          error: copy.guestRateLimitDaily,
          errorCode: "GUEST_RATE_LIMIT_DAILY",
          signupCta: true,
          signupPath: buildGuestSignupPath(),
        },
        { status: 429 }
      );
    }
    reservation = rateLimitResult.reservation ?? null;

    if (!geminiApiKey && model !== "gpt-image-2-low") {
      // Gemini を呼ぶ必要があるが API キーが無い → 上流不可
      await releaseReservedAttempt("infra_error");
      return jsonError(
        copy.guestUpstreamUnavailable,
        "GUEST_UPSTREAM_UNAVAILABLE",
        500
      );
    }
    if (!openaiApiKey && model === "gpt-image-2-low") {
      await releaseReservedAttempt("infra_error");
      return jsonError(
        copy.guestUpstreamUnavailable,
        "GUEST_UPSTREAM_UNAVAILABLE",
        500
      );
    }

    const dispatchResult = await dispatchGuestImageGeneration({
      model,
      promptText: composedPrompt,
      uploadImage,
      geminiApiKey: geminiApiKey ?? "",
      openaiApiKey,
      fetchFn: dependencies.fetchFn,
      openaiClient: dependencies.openaiClient,
    });

    if (shouldReleaseReservationFor(dispatchResult)) {
      // UCL-011a: 上流由来の失敗は試行を消費させない
      const reason: GuestAttemptReleaseReason =
        dispatchResult.kind === "timeout"
          ? "timeout"
          : dispatchResult.kind === "no_image"
            ? "no_image_generated"
            : dispatchResult.kind === "openai_provider_error"
              ? "infra_error"
              : "upstream_error";
      await releaseReservedAttempt(reason);
    }

    switch (dispatchResult.kind) {
      case "success":
        return NextResponse.json({
          imageDataUrl: dispatchResult.imageDataUrl,
          mimeType: dispatchResult.mimeType,
        });
      case "safety_blocked":
        // UCL-011b: safety/policy block は consume したまま維持
        return jsonError(
          copy.guestSafetyBlocked,
          "GUEST_SAFETY_BLOCKED",
          400
        );
      case "no_image":
        return jsonError(
          copy.noImagesGenerated,
          "GUEST_NO_IMAGE_GENERATED",
          502
        );
      case "timeout":
        return jsonError(copy.guestUpstreamUnavailable, "GUEST_TIMEOUT", 504);
      case "openai_provider_error":
        // OpenAI 構成不備 (auth / quota 等)。ユーザーには汎用のメッセージを返し、
        // 詳細はサーバーログに残す。
        console.error(
          "Coordinate guest generate route: OpenAI provider error",
          dispatchResult.message
        );
        return jsonError(
          copy.guestUpstreamUnavailable,
          "GUEST_UPSTREAM_UNAVAILABLE",
          502
        );
      case "upstream_error":
        return NextResponse.json(
          {
            error: copy.guestUpstreamUnavailable,
            errorCode: "GUEST_UPSTREAM_ERROR",
          },
          { status: dispatchResult.status >= 500 ? 502 : dispatchResult.status }
        );
      case "user_input_error":
        return jsonError(
          dispatchResult.message,
          "GUEST_INVALID_IMAGE",
          400
        );
    }
  } catch (error) {
    console.error("Coordinate guest generate route error", error);
    if (reservation) {
      try {
        await releaseRateLimitAttemptFn({
          reservation,
          reason: "infra_error",
        });
      } catch (releaseError) {
        console.error(
          "Coordinate guest generate route: failed to release after internal error",
          releaseError
        );
      }
    }
    return jsonError(copy.guestUpstreamUnavailable, "GUEST_INTERNAL_ERROR", 500);
  }
}

export const coordinateGenerateGuestRouteHandlers = {
  postCoordinateGenerateGuestRoute,
};
