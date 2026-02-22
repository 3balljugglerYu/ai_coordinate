import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderationDecisionSchema } from "@/features/moderation/lib/schemas";
import { logAdminAction } from "@/lib/admin-audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
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

    const { action, reason } = payload.data;
    const nextStatus = action === "approve" ? "visible" : "removed";
    const now = new Date().toISOString();

    const adminClient = createAdminClient();

    const { data: decisionApplied, error: decisionError } = await adminClient.rpc(
      "apply_admin_moderation_decision",
      {
        p_post_id: postId,
        p_actor_id: adminUser.id,
        p_action: action,
        p_reason: reason || null,
        p_decided_at: now,
        p_metadata: { decided_at: now },
      }
    );

    if (decisionError) {
      console.error("Moderation decision RPC error:", decisionError);
      return NextResponse.json(
        { error: "審査判定の反映に失敗しました" },
        { status: 500 }
      );
    }

    if (!decisionApplied) {
      return NextResponse.json({ error: "投稿が見つかりません" }, { status: 404 });
    }

    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: action === "approve" ? "moderation_approve" : "moderation_reject",
      targetType: "post",
      targetId: postId,
      metadata: { reason: reason ?? null },
    });

    return NextResponse.json({ success: true, moderation_status: nextStatus });
  } catch (error) {
    console.error("Moderation decision API error:", error);
    return NextResponse.json(
      { error: "審査判定の反映に失敗しました" },
      { status: 500 }
    );
  }
}
