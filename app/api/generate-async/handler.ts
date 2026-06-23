import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isCreatorLooksEnabledForUser } from "@/lib/auth/creator-looks";
import { generationRequestSchema, getSafeExtensionFromMimeType } from "@/features/generation/lib/schema";
import { convertHeicBase64ToJpeg, isHeicImage } from "@/features/generation/lib/heic-converter";
import { env, isAdminViewer } from "@/lib/env";
import type { FramingMode } from "@/shared/generation/framing-mode";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import type { ImageJobCreateInput } from "@/features/generation/lib/job-types";
import {
  getPercoinCost,
  creatorLooksCost,
  isModelAvailableForGeneration,
} from "@/features/generation/lib/model-config";
import {
  type CreatorLooksMode,
  overridesForCreatorLooksMode,
  maxStagesForCreatorLooksMode,
} from "@/shared/generation/creator-looks-mode";
import {
  getCreatorLooksTwoStageVisibility,
  isTwoStageModeAvailable,
} from "@/features/inspire/lib/creator-looks-two-stage";
import {
  DEFAULT_GENERATION_MODEL,
  isOpenAIImageModel,
} from "@/features/generation/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStyleTemplateById } from "@/features/inspire/lib/repository";
import {
  getMaxGenerationCount,
  normalizeSubscriptionPlan,
} from "@/features/subscription/subscription-config";
import {
  createAsyncGenerationJobRepository,
  type AsyncGenerationJobRepository,
} from "@/features/generation/lib/async-generation-job-repository";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getGenerationRouteCopy } from "@/features/generation/lib/route-copy";
import { DEFAULT_LOCALE } from "@/i18n/config";

const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;

// Creator Looks: per-user-per-template cool-down (= REQ-007 連打防止 / コスト暴走防止)
const CREATOR_LOOKS_COOLDOWN_SECONDS = 60;

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
  // CSRF 防御: 同一オリジン以外の mutation を reject (Phase 3 必須)
  const originReject = ensureSameOrigin(request);
  if (originReject) return originReject;

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
      sourceImageGeneratedId,
      sourceImageType,
      backgroundMode,
      count,
      generationType,
      model,
      styleTemplateId,
      overrides,
      framingMode,
      posePrompt,
      creatorLooksMode,
    } = validationResult.data;
    const effectiveModel = model || DEFAULT_GENERATION_MODEL;
    // Creator Looks 投稿テンプレ(is_creator_looks)に対してのみ有効な生成モード。
    // 一般 inspire には適用しない。inspire 検証ブロックで template 確認後に確定する。
    let effectiveCreatorLooksMode: CreatorLooksMode | null = null;
    if (!isModelAvailableForGeneration(effectiveModel)) {
      return jsonError(
        copy.modelTemporarilyUnavailable,
        "GENERATION_MODEL_TEMPORARILY_UNAVAILABLE",
        400
      );
    }

    // framing_mode (admin viewer 限定の先行公開)。coordinate 限定は schema で検証済み。
    // locked 以外 (free_pose) は非 admin から送られたら 400
    // (UI 非表示はセキュリティではないためサーバでも遮断)。
    const effectiveFramingMode: FramingMode = framingMode ?? "locked";
    if (effectiveFramingMode !== "locked" && !isAdminViewer(user.id)) {
      return jsonError(
        copy.invalidRequest,
        "GENERATION_FRAMING_MODE_NOT_ALLOWED",
        400
      );
    }

    // posePrompt (ポーズ・カメラ指定欄、admin viewer 限定)。free_pose のときのみ有効。
    // 非空かつ非 admin は 400 (UI 非表示はセキュリティではないためサーバでも遮断)。
    const posePromptTrimmed =
      typeof posePrompt === "string" ? posePrompt.trim() : "";
    if (posePromptTrimmed.length > 0 && !isAdminViewer(user.id)) {
      return jsonError(
        copy.invalidRequest,
        "GENERATION_POSE_PROMPT_NOT_ALLOWED",
        400
      );
    }
    // free_pose 以外で posePrompt が来ても無視する (locked はポーズ固定のため矛盾)。
    const effectivePosePrompt =
      effectiveFramingMode === "free_pose" ? posePromptTrimmed : "";
    const isOpenAIBatchCandidate = isOpenAIImageModel(effectiveModel);
    const isInspireRequest = generationType === "inspire";

    // inspire 専用: テンプレ visibility 検証
    let inspireStyleTemplateImageUrl: string | null = null;
    if (isInspireRequest) {
      if (!styleTemplateId) {
        return jsonError(
          "スタイルテンプレートが指定されていません",
          "GENERATION_INSPIRE_TEMPLATE_REQUIRED",
          400
        );
      }
      // テンプレが visible 状態かを admin client で検証
      const adminClient = createAdminClient();
      const { data: template, error: templateError } = await getStyleTemplateById(
        adminClient,
        styleTemplateId
      );
      if (templateError || !template) {
        return jsonError(
          "スタイルテンプレートが見つかりません",
          "GENERATION_INSPIRE_TEMPLATE_NOT_FOUND",
          404
        );
      }
      if (template.moderation_status !== "visible") {
        // 申請者本人のみ自分の draft / pending / removed / withdrawn を使うことは禁止
        return jsonError(
          "スタイルテンプレートが現在公開されていません",
          "GENERATION_INSPIRE_TEMPLATE_NOT_VISIBLE",
          409
        );
      }
      // image_url は storage_path 文字列（Storage 内部パス）。Worker 側で署名 URL 化して fetch する。
      inspireStyleTemplateImageUrl = template.storage_path;

      // Stage 1 厳密化 (Phase 8): Creator Looks 投稿の生成は admin/allowlist のみ許可
      // 一般ユーザーが styleTemplateId を直接叩いて生成しようとしても 403 で reject
      if (template.is_creator_looks === true) {
        const allowed = await isCreatorLooksEnabledForUser(user);
        if (!allowed) {
          return jsonError(
            "現在この機能は限定公開中です",
            "CREATOR_LOOKS_NOT_AVAILABLE",
            403
          );
        }

        // 生成モードを確定(未指定は衣装のみ)。
        effectiveCreatorLooksMode = creatorLooksMode ?? "outfit_only";

        // 2段階(衣装＋背景)モードの公開ガード。
        // admin_only のときは admin/プレビュー権限ユーザー以外には許可しない
        // (UI 非表示はセキュリティではないためサーバでも遮断)。
        if (effectiveCreatorLooksMode === "outfit_and_background") {
          const visibility =
            await getCreatorLooksTwoStageVisibility(adminClient);
          if (!isTwoStageModeAvailable(visibility, isAdminViewer(user.id))) {
            return jsonError(
              "この生成モードは現在利用できません",
              "CREATOR_LOOKS_TWO_STAGE_NOT_AVAILABLE",
              403
            );
          }
        }
      }

      // Creator Looks 投稿の場合: per-user-per-template cool-down (= REQ-007, HI-005 Security)
      // 過去 60 秒以内に同 user × 同 template の image_jobs が存在すれば 429。
      // Stage 1 では admin only なので影響は限定的だが、Stage 3 でコスト暴走対策となる。
      if (template.is_creator_looks === true) {
        const cooldownSince = new Date(
          Date.now() - CREATOR_LOOKS_COOLDOWN_SECONDS * 1000
        ).toISOString();
        const { count: recentJobsCount, error: cooldownError } =
          await adminClient
            .from("image_jobs")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("style_template_id", styleTemplateId)
            .gte("created_at", cooldownSince);
        if (cooldownError) {
          console.error(
            "[generate-async] creator_looks cooldown query failed",
            cooldownError
          );
          // 失敗時は fail-open (= 既存挙動を維持)。Stage 1 では admin only なのでリスクは低い。
        } else if ((recentJobsCount ?? 0) > 0) {
          return jsonError(
            "少々お待ちください (前回の生成から 60 秒以内です)",
            "CREATOR_LOOKS_COOLDOWN",
            429
          );
        }

        // Creator Looks 投稿で hidden_prompt が未生成なら 422 (= UX 上の明示エラー、REQ-015)
        const { data: secret } = await adminClient
          .from("user_style_template_secrets")
          .select("template_id")
          .eq("template_id", styleTemplateId)
          .maybeSingle();
        if (!secret) {
          return jsonError(
            "準備中です。しばらくお待ちください",
            "CREATOR_LOOKS_HIDDEN_PROMPT_NOT_READY",
            422
          );
        }
      }
    }

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
    } else if (sourceImageGeneratedId) {
      // 生成済み画像 ID がある場合、generated_images の image_url を再利用する。
      // クライアントは画像本体をアップロードせず、サーバ側で user_id 整合を取る
      // (RLS と二重防御)。アップロードのラウンドトリップを完全に省略できる。
      // エラーコピーは stock 用を流用 (ユーザー視点では同等の見え方で十分)。
      try {
        const { data: generated, error: genError } =
          await jobRepository.findGeneratedImage(
            sourceImageGeneratedId,
            user.id,
          );

        if (genError || !generated) {
          console.error("Failed to fetch source generated image:", genError);
          return jsonError(
            copy.sourceStockNotFound,
            "GENERATION_SOURCE_GENERATED_NOT_FOUND",
            404,
          );
        }

        inputImageUrl = generated.image_url;
      } catch (error) {
        console.error("Error fetching source generated image:", error);
        return jsonError(
          copy.sourceStockFetchFailed,
          "GENERATION_SOURCE_GENERATED_FETCH_FAILED",
          500,
        );
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

    let acceptedImageCount = 1;
    if (isOpenAIBatchCandidate) {
      const subscriptionPlanResult =
        await jobRepository.getUserSubscriptionPlan(user.id);

      if (subscriptionPlanResult.error || !subscriptionPlanResult.data) {
        console.error(
          "Failed to fetch user subscription plan:",
          subscriptionPlanResult.error
        );
        return jsonError(
          copy.balanceFetchFailed,
          "GENERATION_SUBSCRIPTION_PLAN_FETCH_FAILED",
          500
        );
      }

      const subscriptionPlan = normalizeSubscriptionPlan(
        subscriptionPlanResult.data.subscription_plan
      );
      acceptedImageCount = Math.min(
        count,
        getMaxGenerationCount(subscriptionPlan)
      );
    }

    const batchMode = isOpenAIBatchCandidate
      ? "openai_single_job"
      : "single_job";

    // ペルコイン残高チェック
    // Creator Looks はモード別コスト(衣装＋背景=ceil(モデルコスト×2×0.9))。
    // 実消費(worker)も同じ creatorLooksCost を使うこと(不整合防止)。
    const percoinCost = effectiveCreatorLooksMode
      ? creatorLooksCost(effectiveModel, effectiveCreatorLooksMode)
      : getPercoinCost(effectiveModel);
    const requiredPercoinCost = percoinCost * acceptedImageCount;

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
    if (currentBalance < requiredPercoinCost) {
      return jsonError(
        copy.insufficientBalance(requiredPercoinCost, currentBalance),
        "GENERATION_INSUFFICIENT_BALANCE",
        400
      );
    }

    // Creator Looks 生成モードが指定されていれば override_* をモードから導出する
    // (overrides より優先)。それ以外は従来の overrides をそのまま使う。
    const resolvedOverrides = effectiveCreatorLooksMode
      ? overridesForCreatorLooksMode(effectiveCreatorLooksMode)
      : overrides;

    // generation_metadata: framingMode(locked 以外)と Creator Looks モード/段階数を統合。
    const generationMetadata: Record<string, unknown> = {};
    if (effectiveFramingMode !== "locked") {
      generationMetadata.framingMode = effectiveFramingMode;
    }
    if (effectivePosePrompt.length > 0) {
      generationMetadata.posePrompt = effectivePosePrompt;
    }
    if (effectiveCreatorLooksMode) {
      generationMetadata.creatorLooksMode = effectiveCreatorLooksMode;
      generationMetadata.creatorLooksMaxStages = maxStagesForCreatorLooksMode(
        effectiveCreatorLooksMode,
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
      model: effectiveModel,
      background_mode: backgroundMode,
      status: "queued",
      processing_stage: "queued",
      requested_image_count: acceptedImageCount,
      attempts: 0,
      // inspire 列: 整合性 CHECK は (generation_type='inspire') = (style_template_id IS NOT NULL)
      style_template_id: isInspireRequest ? styleTemplateId ?? null : null,
      style_reference_image_url: isInspireRequest
        ? inspireStyleTemplateImageUrl
        : null,
      // Inspire override の 4 bool。未指定時は「すべて維持」のデフォルトを入れる。
      // 整合性は schema 側の superRefine で「1 つ以上 true」をバリデーション済み。
      override_outfit: isInspireRequest ? resolvedOverrides?.outfit ?? true : null,
      override_angle: isInspireRequest ? resolvedOverrides?.angle ?? true : null,
      override_pose: isInspireRequest ? resolvedOverrides?.pose ?? true : null,
      override_background: isInspireRequest
        ? resolvedOverrides?.background ?? true
        : null,
      // generation_metadata: framingMode(locked 以外) と Creator Looks モード/段階数。
      // worker がプロンプト構築・2段階生成判定に使い、完了 RPC 経由で
      // generated_images.generation_metadata へコピーされて品質比較にも使える。
      ...(Object.keys(generationMetadata).length > 0
        ? { generation_metadata: generationMetadata }
        : {}),
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
          acceptedImageCount,
          batchMode,
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
      acceptedImageCount,
      batchMode,
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
