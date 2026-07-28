import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderationDecisionSchema } from "@/features/moderation/lib/schemas";
import { findModerationPolicy } from "@/constants/moderation-policy";
import { logAdminAction } from "@/lib/admin-audit";
import { ensureSameOrigin } from "@/lib/security/same-origin";

/**
 * POST /api/admin/moderation/posts/[postId]/decision
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-001, ADR-007, ADR-009, ADR-011
 *
 * - `apply_admin_moderation_decision_v2` が状態更新・監査ログ・通知 outbox を
 *   同一トランザクションで確定する。API から notifications へ直 INSERT はしない
 * - dispatcher は best effort で呼ぶ。失敗しても outbox が残るので pg_cron が再試行する
 * - `revalidateTag` は個別に non-fatal で呼ぶ（ADR-007。従来これが欠落しており、
 *   approve による復帰が cacheLife の自然失効待ちになっていた）
 * - 投稿者向けの通知内容は RPC 側で outbox payload に組み立てる。ここでは
 *   `internalNote` を outbox へ渡さない（ADR-011 / REQ-022）
 */

/** 判定で影響するキャッシュタグ。通報 API (app/api/reports/posts/route.ts) と揃える。 */
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
      // 1タグの失敗で判定全体を失敗させない
      console.error("[Moderation] revalidateTag failed:", { tag, error });
    }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
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

    const { postId } = await params;
    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const payload = moderationDecisionSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const {
      action,
      idempotencyKey,
      policyCode,
      authorFacingReason,
      internalNote,
    } = payload.data;

    const adminClient = createAdminClient();

    // 投稿者 ID はキャッシュタグの解決に使う（通知の宛先は RPC 側で解決する）
    const { data: post, error: postError } = await adminClient
      .from("generated_images")
      .select("id,user_id")
      .eq("id", postId)
      .maybeSingle<{ id: string; user_id: string | null }>();

    if (postError) {
      console.error("[Moderation] post fetch failed:", postError);
      return NextResponse.json({ error: "投稿情報の取得に失敗しました" }, { status: 500 });
    }
    if (!post) {
      return NextResponse.json({ error: "投稿が見つかりません" }, { status: 404 });
    }

    const policy = action === "reject" ? findModerationPolicy(policyCode) : null;
    if (action === "reject" && !policy) {
      return NextResponse.json(
        { error: "執行ポリシーが不正です" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data: decisionId, error: rpcError } = await adminClient.rpc(
      "apply_admin_moderation_decision_v2",
      {
        p_post_id: postId,
        p_actor_id: adminUser.id,
        p_action: action,
        p_idempotency_key: idempotencyKey,
        p_policy_code: policy?.code ?? null,
        p_policy_version: policy?.version ?? null,
        p_policy_anchor: policy?.anchor ?? null,
        p_author_facing_reason: authorFacingReason ?? null,
        p_internal_note: internalNote ?? null,
        p_restriction_scope: "all_users",
        p_restriction_duration: "until_reversed",
        p_decision_source: "admin_review",
        p_automated_means_used: false,
        p_decided_at: now,
        p_metadata: { decided_at: now },
      }
    );

    if (rpcError) {
      console.error("[Moderation] decision RPC failed:", rpcError);
      return NextResponse.json({ error: "審査判定の反映に失敗しました" }, { status: 500 });
    }

    if (!decisionId) {
      // 対象が pending でない（既に判定済み / 復帰済み）
      return NextResponse.json(
        { error: "対象の投稿は審査待ちではありません" },
        { status: 409 }
      );
    }

    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: action === "approve" ? "moderation_approve" : "moderation_reject",
      targetType: "post",
      targetId: postId,
      // internalNote は横断監査ログにも残さない（投稿者向け経路と分離した意図を保つ）
      metadata: { policy_code: policy?.code ?? null, decision_id: decisionId },
    });

    // 通知の即時配送。失敗しても outbox に残るため pg_cron が1分後に再試行する。
    const { error: dispatchError } = await adminClient.rpc(
      "dispatch_moderation_notification_outbox",
      { p_limit: 10 }
    );
    if (dispatchError) {
      console.error("[Moderation] outbox dispatch failed (will retry via cron):", dispatchError);
    }

    revalidateModerationTags(postId, post.user_id);

    return NextResponse.json({
      success: true,
      moderation_status: action === "approve" ? "visible" : "removed",
      moderation_decision_id: decisionId,
    });
  } catch (error) {
    console.error("Moderation decision API error:", error);
    return NextResponse.json(
      { error: "審査判定の反映に失敗しました" },
      { status: 500 }
    );
  }
}
