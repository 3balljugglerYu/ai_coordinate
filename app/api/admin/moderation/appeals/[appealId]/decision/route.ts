import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { appealDecisionSchema } from "@/features/moderation/lib/schemas";
import { logAdminAction } from "@/lib/admin-audit";
import { ensureSameOrigin } from "@/lib/security/same-origin";

/**
 * POST /api/admin/moderation/appeals/[appealId]/decision
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-005, ADR-007, ADR-009 / REQ-010, REQ-011, REQ-012
 *
 * 用語:
 *   action = "uphold"   → 元の公開停止を支持（UI の「棄却する」。removed のまま）
 *   action = "overturn" → 元の判定を覆す（UI の「認める」。visible へ復帰）
 *
 * `decide_post_moderation_appeal` RPC が申立て更新・投稿復帰・監査ログ・結果 outbox を
 * 同一トランザクションで確定する。
 */
function revalidateModerationTags(postId: string, authorUserId: string | null) {
  const tags = [
    "home-posts",
    "home-posts-week",
    "search-posts",
    ...(authorUserId ? [`user-profile-${authorUserId}`] : []),
    `post-detail-${postId}`,
  ];

  for (const tag of tags) {
    try {
      revalidateTag(tag, "max");
    } catch (error) {
      console.error("[Moderation] revalidateTag failed:", { tag, error });
    }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appealId: string }> }
) {
  try {
    const originGuard = ensureSameOrigin(request);
    if (originGuard) return originGuard;

    let adminUser;
    try {
      adminUser = await requireAdmin();
    } catch (error) {
      if (error instanceof NextResponse) {
        return error;
      }
      throw error;
    }

    const { appealId } = await params;
    if (!appealId) {
      return NextResponse.json({ error: "Appeal ID is required" }, { status: 400 });
    }

    const payload = appealDecisionSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const { action, note, independenceExceptionReason } = payload.data;
    const adminClient = createAdminClient();

    // 復帰時のキャッシュ無効化に投稿者 ID が要るため、先に対象を引く
    const { data: appeal, error: appealError } = await adminClient
      .from("post_moderation_appeals")
      .select("id,post_id,status")
      .eq("id", appealId)
      .maybeSingle<{ id: string; post_id: string; status: string }>();

    if (appealError) {
      console.error("[Moderation] appeal fetch failed:", appealError);
      return NextResponse.json({ error: "異議申立ての取得に失敗しました" }, { status: 500 });
    }
    if (!appeal) {
      return NextResponse.json({ error: "異議申立てが見つかりません" }, { status: 404 });
    }

    const { data: post } = await adminClient
      .from("generated_images")
      .select("user_id")
      .eq("id", appeal.post_id)
      .maybeSingle<{ user_id: string | null }>();

    const now = new Date().toISOString();

    const { data: applied, error: rpcError } = await adminClient.rpc(
      "decide_post_moderation_appeal",
      {
        p_appeal_id: appealId,
        p_actor_id: adminUser.id,
        p_action: action,
        p_note: note,
        p_independence_exception_reason: independenceExceptionReason ?? null,
        p_decided_at: now,
      }
    );

    if (rpcError) {
      console.error("[Moderation] appeal decision RPC failed:", rpcError);
      // 独立レビューの例外理由が未入力のケースは 400 として返す
      if (
        typeof rpcError.message === "string" &&
        rpcError.message.includes("independence_exception_reason_required")
      ) {
        return NextResponse.json(
          {
            error:
              "元の判定を行った運営者が再審査する場合は、独立したレビューを実施できない理由の入力が必要です",
            errorCode: "APPEAL_INDEPENDENCE_REASON_REQUIRED",
          },
          { status: 400 }
        );
      }
      // 申立て対象が現在有効な公開停止でない場合（申立てが pending の間に投稿が
      // 復帰し、別理由で再度公開停止された等）。認容すると別の判定を解除して
      // しまうため、RPC が変更せずに例外を出す（REQ-009 / REQ-011）。
      if (
        typeof rpcError.message === "string" &&
        rpcError.message.includes("appeal_target_not_current_removal")
      ) {
        return NextResponse.json(
          {
            error:
              "この申立ての対象は、現在有効な公開停止ではありません。投稿の最新の判定を確認してください",
            errorCode: "APPEAL_TARGET_NOT_CURRENT_REMOVAL",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "異議申立ての判定に失敗しました" }, { status: 500 });
    }

    if (!applied) {
      // 既に判定済み（再送の吸収）
      return NextResponse.json(
        { error: "この異議申立ては既に判定済みです" },
        { status: 409 }
      );
    }

    await logAdminAction({
      adminUserId: adminUser.id,
      actionType:
        action === "overturn" ? "moderation_appeal_overturn" : "moderation_appeal_uphold",
      targetType: "post",
      targetId: appeal.post_id,
      metadata: {
        appeal_id: appealId,
        independence_exception: Boolean(independenceExceptionReason),
      },
    });

    const { error: dispatchError } = await adminClient.rpc(
      "dispatch_moderation_notification_outbox",
      { p_limit: 10 }
    );
    if (dispatchError) {
      console.error("[Moderation] outbox dispatch failed (will retry via cron):", dispatchError);
    }

    // 認容時は投稿が visible に戻るため、フィードのキャッシュを無効化する
    if (action === "overturn") {
      revalidateModerationTags(appeal.post_id, post?.user_id ?? null);
    }

    return NextResponse.json({
      success: true,
      status: action === "overturn" ? "overturned" : "upheld",
    });
  } catch (error) {
    console.error("Appeal decision API error:", error);
    return NextResponse.json(
      { error: "異議申立ての判定に失敗しました" },
      { status: 500 }
    );
  }
}
