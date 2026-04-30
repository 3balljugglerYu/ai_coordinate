import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getGenerationRouteCopy } from "@/features/generation/lib/route-copy";
import { normalizeUserFacingGenerationError } from "@/features/generation/lib/normalize-generation-error";

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

async function findGeneratedImageId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  resultImageUrl: string | null
): Promise<string | null> {
  if (!resultImageUrl) {
    return null;
  }

  const { data, error } = await supabase
    .from("generated_images")
    .select("id")
    .eq("user_id", userId)
    .eq("image_url", resultImageUrl)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch generated image id for job:", error);
    return null;
  }

  return typeof data?.id === "string" ? data.id : null;
}

/**
 * 画像生成ステータス取得API
 * image_jobsテーブルから生成ステータスを取得
 */
export async function GET(request: NextRequest) {
  await connection();
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
    const generatedImageId =
      job.status === "succeeded"
        ? await findGeneratedImageId(supabase, user.id, imageUrls.resultImageUrl)
        : null;

    // ステータス、結果画像URL、エラーメッセージを返却
    return NextResponse.json({
      id: job.id,
      status: job.status,
      processingStage: job.processing_stage ?? null,
      previewImageUrl: imageUrls.previewImageUrl,
      resultImageUrl: imageUrls.resultImageUrl,
      errorMessage: normalizedErrorMessage,
      generatedImageId,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return jsonError(copy.statusFetchFailed, "GENERATION_STATUS_FETCH_FAILED", 500);
  }
}
