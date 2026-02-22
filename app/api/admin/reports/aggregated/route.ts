import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPostThumbUrl } from "@/features/posts/lib/utils";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(
    parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10),
    MAX_LIMIT
  );
  const offset = Math.max(
    parseInt(searchParams.get("offset") || "0", 10),
    0
  );

  const supabase = createAdminClient();

  const activeThresholdTime = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const spikeThresholdTime = new Date(
    Date.now() - 10 * 60 * 1000
  ).toISOString();

  const { data: activeRows } = await supabase
    .from("generated_images")
    .select("user_id")
    .eq("is_posted", true)
    .eq("moderation_status", "visible")
    .not("user_id", "is", null)
    .gte("posted_at", activeThresholdTime);

  const activeUsers = new Set((activeRows || []).map((r) => r.user_id)).size;
  const threshold = Math.max(3, Math.ceil(activeUsers * 0.005));

  const { data: reports } = await supabase
    .from("post_reports")
    .select("post_id, weight, created_at")
    .order("created_at", { ascending: false });

  const aggregated = (reports || []).reduce<
    Record<
      string,
      {
        postId: string;
        reportCount: number;
        weightedScore: number;
        recentCount: number;
        latestReportAt: string;
      }
    >
  >((acc, r) => {
    const pid = r.post_id;
    if (!pid) return acc;
    const item = acc[pid] || {
      postId: pid,
      reportCount: 0,
      weightedScore: 0,
      recentCount: 0,
      latestReportAt: r.created_at,
    };
    item.reportCount += 1;
    item.weightedScore += Number(r.weight || 0);
    if (new Date(r.created_at) >= new Date(spikeThresholdTime)) {
      item.recentCount += 1;
    }
    if (
      !item.latestReportAt ||
      new Date(r.created_at) > new Date(item.latestReportAt)
    ) {
      item.latestReportAt = r.created_at;
    }
    acc[pid] = item;
    return acc;
  }, {});

  const items = Object.values(aggregated).sort(
    (a, b) =>
      new Date(b.latestReportAt).getTime() -
      new Date(a.latestReportAt).getTime()
  );

  const total = items.length;
  const paginated = items.slice(offset, offset + limit);
  const postIds = paginated.map((i) => i.postId);

  let postMap: Record<
    string,
    {
      id: string;
      image_url: string | null;
      storage_path_thumb?: string | null;
      storage_path?: string | null;
      caption: string | null;
      user_id: string | null;
      moderation_status: string | null;
    }
  > = {};

  if (postIds.length > 0) {
    const { data: posts } = await supabase
      .from("generated_images")
      .select(
        "id, image_url, storage_path_thumb, storage_path, caption, user_id, moderation_status"
      )
      .in("id", postIds);
    postMap = (posts || []).reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as typeof postMap);
  }

  const result = paginated.map((item) => {
    const post = postMap[item.postId];
    const overThreshold =
      item.recentCount >= 3 || item.weightedScore >= threshold;
    return {
      ...item,
      postImageUrl: post ? getPostThumbUrl(post) : null,
      postCaption: post?.caption ?? null,
      postModerationStatus: post?.moderation_status ?? null,
      threshold,
      overThreshold,
    };
  });

  return NextResponse.json({
    items: result,
    total,
    limit,
    offset,
    threshold,
  });
}
