import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 未完了画像生成ジョブ取得API
 * image_jobsテーブルから未完了（queued/processing）ジョブの一覧を取得
 * オプションで最近完了したジョブ（直近5分以内のsucceeded/failed）も取得
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
    const includeRecent = searchParams.get("includeRecent") === "true";

    const supabase = await createClient();

    // 未完了ジョブを取得
    const { data: inProgressJobs, error: inProgressError } = await supabase
      .from("image_jobs")
      .select("id, status, created_at")
      .eq("user_id", user.id)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false });

    if (inProgressError) {
      console.error("Failed to fetch in-progress jobs:", inProgressError);
      return NextResponse.json(
        { error: "未完了ジョブの取得に失敗しました" },
        { status: 500 }
      );
    }

    // 最近完了したジョブも取得（直近5分以内、最大10件）
    let recentCompletedJobs: Array<{ id: string; status: string; createdAt: string }> = [];
    if (includeRecent) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: completed, error: completedError } = await supabase
        .from("image_jobs")
        .select("id, status, created_at")
        .eq("user_id", user.id)
        .in("status", ["succeeded", "failed"])
        .gte("created_at", fiveMinutesAgo)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!completedError && completed) {
        recentCompletedJobs = completed.map((job) => ({
          id: job.id,
          status: job.status,
          createdAt: job.created_at,
        }));
      }
    }

    // 未完了ジョブと最近完了したジョブを結合
    const allJobs = [
      ...(inProgressJobs || []).map((job) => ({
        id: job.id,
        status: job.status,
        createdAt: job.created_at,
      })),
      ...recentCompletedJobs,
    ];

    // 作成日時でソート（新しい順）
    allJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // ジョブIDとステータスの配列を返却
    return NextResponse.json({
      jobs: allJobs,
    });
  } catch (error) {
    console.error("In-progress jobs check error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
