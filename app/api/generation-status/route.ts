import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isInvalidGeminiArgumentErrorMessage,
  isMalformedGeminiPartsErrorMessage,
  isSafetyPolicyBlockedErrorMessage,
} from "@/shared/generation/errors";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getGenerationRouteCopy } from "@/features/generation/lib/route-copy";

function normalizeUserFacingGenerationError(
  status: string,
  errorMessage: string | null,
  copy: ReturnType<typeof getGenerationRouteCopy>
): string | null {
  if (status !== "failed" || !errorMessage) return errorMessage;

  if (errorMessage === "No images generated") {
    return copy.noImagesGenerated;
  }

  if (isSafetyPolicyBlockedErrorMessage(errorMessage)) {
    return copy.safetyBlocked;
  }

  if (isMalformedGeminiPartsErrorMessage(errorMessage)) {
    return copy.genericGenerationFailed;
  }

  if (isInvalidGeminiArgumentErrorMessage(errorMessage)) {
    return copy.genericGenerationFailed;
  }

  return errorMessage;
}

function deriveImageUrls(
  status: string,
  resultImageUrl: string | null
): {
  previewImageUrl: string | null;
  resultImageUrl: string | null;
} {
  if (!resultImageUrl) {
    return {
      previewImageUrl: null,
      resultImageUrl: null,
    };
  }

  if (status === "succeeded") {
    return {
      previewImageUrl: null,
      resultImageUrl,
    };
  }

  if (status === "processing") {
    return {
      previewImageUrl: resultImageUrl,
      resultImageUrl: null,
    };
  }

  return {
    previewImageUrl: null,
    resultImageUrl: null,
  };
}

/**
 * 画像生成ステータス取得API
 * image_jobsテーブルから生成ステータスを取得
 */
export async function GET(request: NextRequest) {
  const copy = getGenerationRouteCopy(getRouteLocale(request));

  try {
    // 認証チェック
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "GENERATION_AUTH_REQUIRED", 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get("id");

    if (!jobId) {
      return jsonError(copy.jobIdRequired, "GENERATION_JOB_ID_REQUIRED", 400);
    }

    // image_jobsテーブルから該当ジョブを取得
    const supabase = await createClient();
    const { data: job, error } = await supabase
      .from("image_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", user.id) // RLSポリシーで保護されているが、明示的にフィルタリング
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // レコードが見つからない場合
        return NextResponse.json(
          { error: copy.jobNotFound, errorCode: "GENERATION_JOB_NOT_FOUND" },
          { status: 404 }
        );
      }
      console.error("Failed to fetch job status:", error);
      return jsonError(copy.statusFetchFailed, "GENERATION_STATUS_FETCH_FAILED", 500);
    }

    const normalizedErrorMessage = normalizeUserFacingGenerationError(
      job.status,
      job.error_message,
      copy
    );
    const imageUrls = deriveImageUrls(job.status, job.result_image_url);

    // ステータス、結果画像URL、エラーメッセージを返却
    return NextResponse.json({
      id: job.id,
      status: job.status,
      processingStage: job.processing_stage ?? null,
      previewImageUrl: imageUrls.previewImageUrl,
      resultImageUrl: imageUrls.resultImageUrl,
      errorMessage: normalizedErrorMessage,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return jsonError(copy.statusFetchFailed, "GENERATION_STATUS_FETCH_FAILED", 500);
  }
}
