import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const JOB_PROCESSING_TIMEOUT_MS = 6 * 60 * 1000;

/**
 * 画像生成ステータス取得API
 * image_jobsテーブルから生成ステータスを取得
 */
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get("id");

    if (!jobId) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 }
      );
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
          { error: "ジョブが見つかりません" },
          { status: 404 }
        );
      }
      console.error("Failed to fetch job status:", error);
      return NextResponse.json(
        { error: "ステータスの取得に失敗しました" },
        { status: 500 }
      );
    }

    // Edge Function異常終了などでprocessingが長時間継続するケースを救済
    if (job.status === "processing") {
      const startedAt = job.started_at ? new Date(job.started_at).getTime() : 0;
      const now = Date.now();
      const elapsed = now - startedAt;

      if (!startedAt || elapsed >= JOB_PROCESSING_TIMEOUT_MS) {
        const timeoutMessage = "処理がタイムアウトしました。入力画像サイズを下げて再試行してください。";
        try {
          const admin = createAdminClient();
          const { error: timeoutUpdateError } = await admin
            .from("image_jobs")
            .update({
              status: "failed",
              error_message: timeoutMessage,
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id)
            .eq("user_id", user.id)
            .eq("status", "processing");

          if (timeoutUpdateError) {
            console.error("Failed to mark stale job as failed:", timeoutUpdateError);
          } else {
            job.status = "failed";
            job.error_message = timeoutMessage;
          }
        } catch (timeoutError) {
          console.error("Stale job rescue failed:", timeoutError);
        }
      }
    }

    const normalizedErrorMessage =
      job.status === "failed" && job.error_message === "No images generated"
        ? "画像を生成できませんでした。"
        : job.error_message;

    // ステータス、結果画像URL、エラーメッセージを返却
    return NextResponse.json({
      id: job.id,
      status: job.status,
      resultImageUrl: job.result_image_url,
      errorMessage: normalizedErrorMessage,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
