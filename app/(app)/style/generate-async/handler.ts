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
import { env, isAdminViewer } from "@/lib/env";
import { ensureSameOrigin } from "@/lib/security/same-origin";
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
import {
  getPercoinCost,
  isModelAvailableForGeneration,
} from "@/features/generation/lib/model-config";
import { buildOneTapStyleGenerationMetadata } from "@/shared/generation/one-tap-style-metadata";
import type { SourceImageType } from "@/shared/generation/prompt-core";
import { buildStyleGenerationPrompt } from "@/shared/generation/style-prompts";
import { resolveAllPromptTemplates } from "@/features/generation-prompts/lib/resolve-templates";
import { GENERATION_PROMPT_MAX_LENGTH } from "@/features/generation/lib/prompt-validation";

interface StyleGenerateAsyncRouteDependencies {
  getUserFn?: typeof getUser;
  jobRepository?: AsyncGenerationJobRepository;
  invokeImageWorkerFn?: (edgeFunctionUrl: string) => void;
  supabaseUrl?: string;
  getPublishedStylePresetForGenerationFn?: typeof getPublishedStylePresetForGeneration;
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
    // CSRF 防御: cookie 認証でペルコイン消費・ジョブ投入する mutation route のため、
    // request body を読む前に Same-Origin Origin 検証を通す。
    const originGuard = ensureSameOrigin(request);
    if (originGuard) return originGuard;

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

    const isAdminUser = isAdminViewer(user.id);
    const preset = await getPublishedStylePresetForGenerationFn(styleId, {
      includeAdminOnly: isAdminUser,
    });
    if (!preset) {
      return jsonError(copy.invalidStylePreset, "STYLE_INVALID_STYLE", 400);
    }
    if (preset.category.visibility === "admin_only" && !isAdminUser) {
      return jsonError(copy.invalidStylePreset, "STYLE_INVALID_STYLE", 400);
    }
    const effectiveSourceImageType: SourceImageType =
      preset.category.showSourceImageTypeControl
        ? sourceImageType
        : "illustration";
    const effectiveBackgroundChange = preset.category.showBackgroundChangeControl
      ? backgroundChange
      : false;
    const effectiveModel = preset.category.showGenerationModelControl
      ? model
      : DEFAULT_GENERATION_MODEL;
    if (!isModelAvailableForGeneration(effectiveModel)) {
      return jsonError(
        copy.modelTemporarilyUnavailable,
        "STYLE_MODEL_TEMPORARILY_UNAVAILABLE",
        400
      );
    }

    // ソース画像の入力は次の 3 経路から 1 つだけ:
    //  1. アップロード (uploadImage: File)
    //  2. ストック画像 (sourceImageStockId)
    //  3. 生成済み画像の再利用 (sourceImageGeneratedId)
    // 2 / 3 のときは画像本体は既に Supabase Storage 上にあるので、
    // クライアントから再アップロードさせず DB の image_url を流用する。
    const uploadImage = getFile(formData.get("uploadImage"));
    // dual + user_upload preset の image_1。preset.dualReferenceSource='user_upload' のときのみ意味あり。
    const uploadImage2 = getFile(formData.get("uploadImage2"));
    // category.showUserPromptInput=true のときのみ意味あり (= サーバ側ホワイトリスト, REQ-12)
    const userPromptEntry = formData.get("userPrompt");
    const userPromptRaw =
      typeof userPromptEntry === "string" ? userPromptEntry : "";
    const sourceImageStockIdEntry = formData.get("sourceImageStockId");
    const sourceImageStockId =
      typeof sourceImageStockIdEntry === "string" &&
      sourceImageStockIdEntry.trim().length > 0
        ? sourceImageStockIdEntry.trim()
        : null;
    const sourceImageGeneratedIdEntry = formData.get("sourceImageGeneratedId");
    const sourceImageGeneratedId =
      typeof sourceImageGeneratedIdEntry === "string" &&
      sourceImageGeneratedIdEntry.trim().length > 0
        ? sourceImageGeneratedIdEntry.trim()
        : null;

    const sourceInputCount =
      (uploadImage ? 1 : 0) +
      (sourceImageStockId ? 1 : 0) +
      (sourceImageGeneratedId ? 1 : 0);
    if (sourceInputCount === 0) {
      return jsonError(
        copy.missingUploadImage,
        "STYLE_MISSING_UPLOAD_IMAGE",
        400
      );
    }
    if (sourceInputCount > 1) {
      return jsonError(
        copy.missingUploadImage,
        "STYLE_AMBIGUOUS_SOURCE_IMAGE",
        400
      );
    }

    if (uploadImage) {
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
    }

    if (effectiveBackgroundChange && !preset.backgroundPrompt?.trim()) {
      return jsonError(
        copy.styleBackgroundPromptUnavailable,
        "STYLE_BACKGROUND_PROMPT_UNAVAILABLE",
        400
      );
    }

    // REQ-13: user_upload (image_1) と userPrompt の validation は credit 残高チェックより前。
    // dual + user_upload preset では image_1 が必須。dual + admin / single では uploadImage2 は無視。
    const expectsUserUploadImage2 =
      preset.imageInputMode === "dual" &&
      preset.dualReferenceSource === "user_upload";
    if (expectsUserUploadImage2) {
      if (!uploadImage2) {
        return jsonError(
          copy.missingUploadImage,
          "STYLE_DUAL_USER_IMAGE_REQUIRED",
          400
        );
      }
      const refValidationError = validateImageFile(
        uploadImage2,
        copy.uploadImageLabel,
        copy
      );
      if (refValidationError) {
        return jsonError(
          refValidationError,
          "STYLE_INVALID_DUAL_USER_IMAGE",
          400
        );
      }
    }

    // category.show_user_prompt_input=true なら userPrompt を採用、false なら無視 (REQ-12)
    const effectiveUserPromptInput =
      preset.category.showUserPromptInput && userPromptRaw.trim().length > 0
        ? userPromptRaw
        : null;
    if (
      preset.category.showUserPromptInput &&
      userPromptRaw.length > GENERATION_PROMPT_MAX_LENGTH
    ) {
      return jsonError(
        copy.invalidStylePreset,
        "STYLE_USER_PROMPT_TOO_LONG",
        400
      );
    }

    // 残高チェック (Phase 5 / ADR-008)。実減算は worker。
    const percoinCost = getPercoinCost(effectiveModel);
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

    const promptTemplates = await resolveAllPromptTemplates();
    const prompt = buildStyleGenerationPrompt(
      {
        stylingPrompt: preset.stylingPrompt,
        backgroundPrompt: preset.backgroundPrompt,
        backgroundChange: effectiveBackgroundChange,
        sourceImageType: effectiveSourceImageType,
        templates: promptTemplates,
        userPromptInput: effectiveUserPromptInput,
      },
      // raw モード (preset.category.skip_base_prefix=true) なら共通 prefix を一切付与しない。
      { skipBasePrefix: preset.category.skipBasePrefix },
    );

    // 3 経路のうち選択された 1 つから inputImageUrl と resolvedStockId を確定。
    let inputImageUrl: string;
    let resolvedStockId: string | null = null;

    if (sourceImageStockId) {
      const { data: stock, error: stockError } =
        await jobRepository.findSourceImageStock(sourceImageStockId, user.id);
      if (stockError || !stock) {
        console.error(
          "Style async generate route: failed to fetch source stock",
          stockError
        );
        return jsonError(
          copy.generationFailed,
          "STYLE_SOURCE_STOCK_NOT_FOUND",
          404
        );
      }
      inputImageUrl = stock.image_url;
      resolvedStockId = stock.id;
    } else if (sourceImageGeneratedId) {
      const { data: generated, error: genError } =
        await jobRepository.findGeneratedImage(
          sourceImageGeneratedId,
          user.id
        );
      if (genError || !generated) {
        console.error(
          "Style async generate route: failed to fetch source generated",
          genError
        );
        return jsonError(
          copy.generationFailed,
          "STYLE_SOURCE_GENERATED_NOT_FOUND",
          404
        );
      }
      inputImageUrl = generated.image_url;
    } else if (uploadImage) {
      const arrayBuffer = await uploadImage.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 15);
      const extension = getSafeExtensionFromMimeType(uploadImage.type);
      const fileName = `temp/${user.id}/${timestamp}-${randomStr}.${extension}`;

      const { data: uploadData, error: uploadError } =
        await jobRepository.uploadSourceImage(
          fileName,
          buffer,
          uploadImage.type
        );

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

      inputImageUrl = jobRepository.getSourceImagePublicUrl(uploadData.path);
    } else {
      // 上の sourceInputCount チェックを通過した時点で必ずいずれかに該当する。
      return jsonError(
        copy.missingUploadImage,
        "STYLE_MISSING_UPLOAD_IMAGE",
        400
      );
    }

    // UCL-016 / ADR-008: billingMode は常に "paid"。worker はこれを見て減算する。
    // dual モード preset の image_1 取得経路 (ADR-005):
    //   - admin: preset.referenceImageStoragePath を style_presets bucket から worker が取得
    //   - user_upload: uploadImage2 を temp upload した path を generated-images bucket から取得
    let styleReferenceImageUrl: string | null = null;
    let styleReferenceImageBucket:
      | "style_presets"
      | "generated-images"
      | null = null;
    if (
      preset.imageInputMode === "dual" &&
      preset.dualReferenceSource === "admin" &&
      preset.referenceImageStoragePath !== null
    ) {
      styleReferenceImageUrl = preset.referenceImageStoragePath;
      styleReferenceImageBucket = "style_presets";
    } else if (expectsUserUploadImage2 && uploadImage2) {
      // user_upload 経路: temp upload で path 保存。bucket は generated-images
      const refArrayBuffer = await uploadImage2.arrayBuffer();
      const refBuffer = Buffer.from(refArrayBuffer);
      const refTimestamp = Date.now();
      const refRandomStr = Math.random().toString(36).substring(2, 15);
      const refExtension = getSafeExtensionFromMimeType(uploadImage2.type);
      const refFileName = `temp/${user.id}/${refTimestamp}-${refRandomStr}-ref.${refExtension}`;
      const { data: refUploadData, error: refUploadError } =
        await jobRepository.uploadSourceImage(
          refFileName,
          refBuffer,
          uploadImage2.type
        );
      if (refUploadError || !refUploadData) {
        console.error(
          "Style async generate route: failed to upload reference image_1",
          refUploadError
        );
        return jsonError(
          copy.styleImageReadFailed,
          "STYLE_DUAL_USER_IMAGE_UPLOAD_FAILED",
          500
        );
      }
      styleReferenceImageUrl = refUploadData.path;
      styleReferenceImageBucket = "generated-images";
    }

    const jobData: ImageJobCreateInput = {
      user_id: user.id,
      prompt_text: prompt,
      input_image_url: inputImageUrl,
      source_image_stock_id: resolvedStockId,
      source_image_type: effectiveSourceImageType,
      generation_type: "one_tap_style",
      model: effectiveModel,
      background_mode: backgroundChangeToBackgroundMode(effectiveBackgroundChange),
      generation_metadata: buildOneTapStyleGenerationMetadata(
        {
          ...preset,
          outputAspectRatioMode: preset.category.outputAspectRatioMode,
        },
        "paid",
        {
          reservedAttemptId: null,
        },
      ),
      status: "queued",
      processing_stage: "queued",
      attempts: 0,
      style_reference_image_url: styleReferenceImageUrl,
      style_reference_image_bucket: styleReferenceImageBucket,
      // category.key のスナップショット (ADR-006)
      style_preset_category_key: preset.category.key,
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
