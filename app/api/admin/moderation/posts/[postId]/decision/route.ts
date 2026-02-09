import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderationDecisionSchema } from "@/features/moderation/lib/schemas";

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
    const nextReason = action === "approve" ? null : reason || "admin_reject";
    const now = new Date().toISOString();
    const approvedAt = action === "approve" ? now : null;

    const adminClient = createAdminClient();

    const { error: updateError } = await adminClient
      .from("generated_images")
      .update({
        moderation_status: nextStatus,
        moderation_reason: nextReason,
        moderation_updated_at: now,
        moderation_approved_at: approvedAt,
      })
      .eq("id", postId);

    if (updateError) {
      console.error("Moderation decision update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update moderation status" },
        { status: 500 }
      );
    }

    const { error: logError } = await adminClient
      .from("moderation_audit_logs")
      .insert({
        post_id: postId,
        actor_id: adminUser.id,
        action,
        reason: reason || null,
        metadata: { decided_at: now },
      });

    if (logError) {
      console.error("Moderation log error:", logError);
    }

    return NextResponse.json({ success: true, moderation_status: nextStatus });
  } catch (error) {
    console.error("Moderation decision API error:", error);
    return NextResponse.json(
      { error: "審査判定の反映に失敗しました" },
      { status: 500 }
    );
  }
}
