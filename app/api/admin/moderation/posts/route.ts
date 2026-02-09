import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPostThumbUrl } from "@/features/posts/lib/utils";

export async function GET(request: NextRequest) {
  try {
    try {
      await requireAdmin();
    } catch (error) {
      if (error instanceof NextResponse) {
        return error;
      }
      throw error;
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    const adminClient = createAdminClient();

    const { data: posts, error } = await adminClient
      .from("generated_images")
      .select(
        "id,user_id,image_url,storage_path_thumb,storage_path,caption,moderation_status,moderation_reason,posted_at,created_at"
      )
      .eq("is_posted", true)
      .eq("moderation_status", "pending")
      .order("moderation_updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Moderation queue fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch moderation queue" },
        { status: 500 }
      );
    }

    const postIds = (posts || []).map((post) => post.id);
    let reportMap: Record<string, { count: number; score: number; latest: string | null }> = {};

    if (postIds.length > 0) {
      const { data: reports, error: reportsError } = await adminClient
        .from("post_reports")
        .select("post_id,weight,created_at")
        .in("post_id", postIds);

      if (reportsError) {
        console.error("Post reports fetch error:", reportsError);
        return NextResponse.json({ error: "Failed to fetch report stats" }, { status: 500 });
      }

      reportMap = (reports || []).reduce((acc, row) => {
        const item = acc[row.post_id] || { count: 0, score: 0, latest: null };
        item.count += 1;
        item.score += Number(row.weight || 0);
        if (!item.latest || new Date(row.created_at) > new Date(item.latest)) {
          item.latest = row.created_at;
        }
        acc[row.post_id] = item;
        return acc;
      }, {} as Record<string, { count: number; score: number; latest: string | null }>);
    }

    return NextResponse.json({
      posts: (posts || []).map((post) => ({
        ...post,
        image_url: getPostThumbUrl(post),
        report_count: reportMap[post.id]?.count || 0,
        weighted_report_score: reportMap[post.id]?.score || 0,
        latest_reported_at: reportMap[post.id]?.latest || null,
      })),
    });
  } catch (error) {
    console.error("Moderation queue API error:", error);
    return NextResponse.json({ error: "審査キューの取得に失敗しました" }, { status: 500 });
  }
}
