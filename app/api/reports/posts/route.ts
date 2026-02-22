import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportPostSchema } from "@/features/moderation/lib/schemas";

const REPORT_LIMIT_PER_10_MINUTES = 10;
const REPORT_LIMIT_PER_24_HOURS = 50;

function calculateReporterWeight(accountCreatedAt?: string | null, postedCount = 0): number {
  const createdAtMs = accountCreatedAt ? new Date(accountCreatedAt).getTime() : Date.now();
  const daysOld = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);

  let baseWeight = 1.0;
  if (daysOld < 3) {
    baseWeight = 0.5;
  } else if (daysOld >= 30) {
    baseWeight = 1.25;
  }

  if (postedCount >= 10) {
    baseWeight += 0.25;
  }

  return Math.min(1.5, Math.max(0.5, baseWeight));
}

interface PendingContext {
  postId: string;
  actorId: string;
  weightedScore: number;
  threshold: number;
  recentCount: number;
  activeUsers: number;
  baselineTime: string;
}

interface PendingMetrics {
  weightedScore: number;
  recentCount: number;
  activeUsers: number;
  threshold: number;
  shouldSetPending: boolean;
}

/**
 * 当該投稿の「審査待ち」判定用メトリクスを計算する。
 * post_reports は RLS で「自分の通報のみ SELECT 可」のため、全ユーザーの通報を集計するには
 * Admin クライアント（RLS をバイパス）で post_reports を参照する必要がある。
 * これを行わないと weightedScore / recentCount が常に最大1程度となり、自動非表示が発火しない。
 */
async function calculatePendingMetrics(
  adminClient: Awaited<ReturnType<typeof createAdminClient>>,
  postId: string,
  baselineTime: string
): Promise<PendingMetrics> {
  const { data: reportRows, error: reportRowsError } = await adminClient
    .from("post_reports")
    .select("weight,created_at")
    .eq("post_id", postId)
    .gt("created_at", baselineTime);

  if (reportRowsError) {
    throw new Error(`report_aggregate_error:${reportRowsError.message}`);
  }

  const weightedScore = (reportRows || []).reduce(
    (acc, item) => acc + Number(item.weight || 0),
    0
  );

  const spikeThresholdTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recentCount = (reportRows || []).filter(
    (item) => new Date(item.created_at).getTime() >= new Date(spikeThresholdTime).getTime()
  ).length;

  const activeThresholdTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: activeRows, error: activeRowsError } = await adminClient
    .from("generated_images")
    .select("user_id")
    .eq("is_posted", true)
    .eq("moderation_status", "visible")
    .not("user_id", "is", null)
    .gte("posted_at", activeThresholdTime);

  if (activeRowsError) {
    throw new Error(`active_users_error:${activeRowsError.message}`);
  }

  const activeUsers = new Set((activeRows || []).map((row) => row.user_id)).size;
  const threshold = Math.max(3, Math.ceil(activeUsers * 0.005));
  const shouldSetPending = recentCount >= 3 || weightedScore >= threshold;

  return {
    weightedScore,
    recentCount,
    activeUsers,
    threshold,
    shouldSetPending,
  };
}

async function setPendingWithRpc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  context: PendingContext
): Promise<{ ok: boolean; reason: string }> {
  const { data, error } = await supabase.rpc("mark_post_pending_by_report", {
    p_post_id: context.postId,
    p_actor_id: context.actorId,
    p_reason: "report_threshold",
    p_metadata: {
      weightedScore: context.weightedScore,
      threshold: context.threshold,
      recentCount: context.recentCount,
      activeUsers: context.activeUsers,
      baselineTime: context.baselineTime,
      mode: "primary",
    },
  });

  if (error) {
    console.error("[Moderation] RPC pending update failed:", {
      context,
      error,
    });
    return { ok: false, reason: "rpc_error" };
  }

  if (!data) {
    return { ok: false, reason: "rpc_no_update" };
  }

  return { ok: true, reason: "rpc_success" };
}

async function isPostAlreadyPending(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string
): Promise<boolean> {
  const { data: currentPost, error } = await supabase
    .from("generated_images")
    .select("moderation_status")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    console.error("[Moderation] Failed to verify moderation status:", { postId, error });
    return false;
  }

  return currentPost?.moderation_status === "pending";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const payload = reportPostSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "不正なリクエストです" },
        { status: 400 }
      );
    }

    const { postId, categoryId, subcategoryId, details } = payload.data;
    const now = Date.now();
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: reportCountIn10Minutes, error: reportCountIn10MinutesError },
      { count: reportCountIn24Hours, error: reportCountIn24HoursError },
    ] = await Promise.all([
      supabase
        .from("post_reports")
        .select("*", { count: "exact", head: true })
        .eq("reporter_id", user.id)
        .gte("created_at", tenMinutesAgo),
      supabase
        .from("post_reports")
        .select("*", { count: "exact", head: true })
        .eq("reporter_id", user.id)
        .gte("created_at", oneDayAgo),
    ]);

    if (reportCountIn10MinutesError || reportCountIn24HoursError) {
      console.error("Rate limit count error:", reportCountIn10MinutesError || reportCountIn24HoursError);
      return NextResponse.json({ error: "通報制限の確認に失敗しました" }, { status: 500 });
    }

    if ((reportCountIn10Minutes || 0) >= REPORT_LIMIT_PER_10_MINUTES) {
      return NextResponse.json(
        {
          error: "短時間での通報回数が上限に達しました。しばらくしてから再試行してください。",
          errorCode: "REPORT_RATE_LIMIT_SHORT",
        },
        { status: 429 }
      );
    }

    if ((reportCountIn24Hours || 0) >= REPORT_LIMIT_PER_24_HOURS) {
      return NextResponse.json(
        {
          error: "1日の通報回数が上限に達しました。翌日に再試行してください。",
          errorCode: "REPORT_RATE_LIMIT_DAILY",
        },
        { status: 429 }
      );
    }

    const { data: post, error: postError } = await supabase
      .from("generated_images")
      .select("id,user_id,is_posted,moderation_status,moderation_approved_at")
      .eq("id", postId)
      .maybeSingle();

    if (postError) {
      console.error("Post fetch error:", postError);
      return NextResponse.json({ error: "投稿情報の取得に失敗しました" }, { status: 500 });
    }

    if (!post || !post.is_posted) {
      return NextResponse.json({ error: "投稿が見つかりません" }, { status: 404 });
    }

    const { count: postedCount, error: postedCountError } = await supabase
      .from("generated_images")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_posted", true);

    if (postedCountError) {
      console.error("Posted count error:", postedCountError);
      return NextResponse.json({ error: "通報評価の計算に失敗しました" }, { status: 500 });
    }

    const weight = calculateReporterWeight(user.created_at, postedCount || 0);

    const { data: reportRow, error: insertError } = await supabase
      .from("post_reports")
      .insert({
        post_id: postId,
        reporter_id: user.id,
        category_id: categoryId,
        subcategory_id: subcategoryId,
        details: details || null,
        weight,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      const isDuplicate = insertError.code === "23505";
      if (isDuplicate) {
        return NextResponse.json(
          { error: "この投稿は既に通報済みです" },
          { status: 400 }
        );
      }
      console.error("Report insert error:", insertError);
      return NextResponse.json({ error: "通報の登録に失敗しました" }, { status: 500 });
    }

    const baselineTime = post.moderation_approved_at || "1970-01-01T00:00:00.000Z";

    let metrics: PendingMetrics;
    let postModerationStatus: "visible" | "pending" | "removed" = post.moderation_status || "visible";
    try {
      const adminClient = createAdminClient();
      metrics = await calculatePendingMetrics(adminClient, postId, baselineTime);

      // 並行通報で集計タイミングが競合した場合に取りこぼしやすいため、短時間だけ再評価する
      if (!metrics.shouldSetPending && postModerationStatus === "visible") {
        await new Promise((resolve) => setTimeout(resolve, 200));
        try {
          metrics = await calculatePendingMetrics(adminClient, postId, baselineTime);
        } catch (aggregateError) {
          console.error("Pending metrics re-calculation error:", aggregateError);
        }
      }
    } catch (aggregateError) {
      console.error("Pending metrics calculation error:", aggregateError);
      return NextResponse.json({ error: "通報集計の取得に失敗しました" }, { status: 500 });
    }

    const { weightedScore, threshold, recentCount, activeUsers, shouldSetPending } = metrics;

    if (shouldSetPending && postModerationStatus === "visible") {
      const context: PendingContext = {
        postId,
        actorId: user.id,
        weightedScore,
        threshold,
        recentCount,
        activeUsers,
        baselineTime,
      };

      const rpcResult = await setPendingWithRpc(supabase, context);
      let pendingApplied = rpcResult.ok;
      if (!pendingApplied) {
        const alreadyPending = await isPostAlreadyPending(supabase, postId);
        if (!alreadyPending) {
          console.error("[Moderation] Pending update failed:", {
            context,
            rpcResult,
          });
          return NextResponse.json(
            { error: "審査ステータスの更新に失敗しました" },
            { status: 500 }
          );
        }
        pendingApplied = true;
      }

      postModerationStatus = pendingApplied ? "pending" : postModerationStatus;
    }

    revalidateTag("home-posts", "max");
    revalidateTag("home-posts-week", "max");
    revalidateTag("search-posts", "max");
    if (post?.user_id) {
      revalidateTag(`user-profile-${post.user_id}`, "max");
    }
    if (post?.id) {
      revalidateTag(`post-detail-${post.id}`, "max");
    }

    return NextResponse.json({
      reportId: reportRow?.id || "",
      postModerationStatus,
      isHiddenForReporter: true,
    });
  } catch (error) {
    console.error("Report post API error:", error);
    return NextResponse.json({ error: "通報に失敗しました" }, { status: 500 });
  }
}
