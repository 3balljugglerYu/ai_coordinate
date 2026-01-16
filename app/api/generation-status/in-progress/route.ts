import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 未完了画像生成ジョブ取得API
 * image_jobsテーブルから未完了（queued/processing）ジョブの一覧を取得
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

    // image_jobsテーブルから未完了ジョブを取得
    const supabase = await createClient();
    const { data: jobs, error } = await supabase
      .from("image_jobs")
      .select("id, status, created_at")
      .eq("user_id", user.id) // RLSポリシーで保護されているが、明示的にフィルタリング
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch in-progress jobs:", error);
      return NextResponse.json(
        { error: "未完了ジョブの取得に失敗しました" },
        { status: 500 }
      );
    }

    // ジョブIDとステータスの配列を返却
    return NextResponse.json({
      jobs: (jobs || []).map((job) => ({
        id: job.id,
        status: job.status,
        createdAt: job.created_at,
      })),
    });
  } catch (error) {
    console.error("In-progress jobs check error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
