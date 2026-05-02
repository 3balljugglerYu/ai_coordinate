import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInspireFeatureEnabled } from "@/lib/env";
import { getInspireRouteCopy } from "@/features/inspire/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";
import { getStyleTemplateById } from "@/features/inspire/lib/repository";

/**
 * DELETE /api/style-templates/submissions/[id]
 *
 * 申請者が自分のテンプレートを取り下げる。
 * - draft → 完全削除（行 + Storage オブジェクト）
 * - pending / visible → moderation_status = 'withdrawn' に変更（行は残す）
 *
 * REQ-S-09 参照。
 * 申請者ホワイトリスト判定はかけない（取り下げは常に可能、計画 §5 Phase 2 の方針）。
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = getInspireRouteCopy(getRouteLocale(request));

  if (!isInspireFeatureEnabled()) {
    return jsonError(copy.notConfigured, "INSPIRE_DISABLED", 404);
  }

  const user = await getUser();
  if (!user) {
    return jsonError(copy.authRequired, "INSPIRE_AUTH_REQUIRED", 401);
  }

  const { id } = await params;
  if (!id) {
    return jsonError(copy.invalidRequest, "INSPIRE_INVALID_ID", 400);
  }

  const adminClient = createAdminClient();
  const { data: template, error: fetchError } = await getStyleTemplateById(
    adminClient,
    id
  );

  if (fetchError) {
    console.error("[submissions DELETE] fetch failed", fetchError);
    return jsonError(copy.withdrawFailed, "INSPIRE_WITHDRAW_FAILED", 500);
  }
  if (!template) {
    return jsonError(copy.templateNotFound, "INSPIRE_TEMPLATE_NOT_FOUND", 404);
  }
  if (template.submitted_by_user_id !== user.id) {
    return jsonError(copy.withdrawNotOwner, "INSPIRE_WITHDRAW_NOT_OWNER", 403);
  }

  if (template.moderation_status === "draft") {
    // Storage を先に消し、DB を後で消す（途中失敗は次回 cleanup cron が回収）
    const storagePathsToRemove = [
      template.storage_path,
      // preview URL は signed URL の場合があるが、storage_path 形式の場合のみ削除
    ].filter((p): p is string => typeof p === "string" && p.length > 0);

    if (storagePathsToRemove.length > 0) {
      const { error: removeError } = await adminClient.storage
        .from("style-templates")
        .remove(storagePathsToRemove);
      if (removeError) {
        console.warn("[submissions DELETE] storage remove failed (non-fatal)", removeError);
      }
    }

    const { error: deleteError } = await adminClient
      .from("user_style_templates")
      .delete()
      .eq("id", id)
      .eq("submitted_by_user_id", user.id);

    if (deleteError) {
      console.error("[submissions DELETE] db delete failed", deleteError);
      return jsonError(copy.withdrawFailed, "INSPIRE_WITHDRAW_FAILED", 500);
    }

    return NextResponse.json({ success: true, action: "deleted" });
  }

  if (template.moderation_status === "pending" || template.moderation_status === "visible") {
    // 状態遷移 + 監査ログを atomic な RPC に委譲（レビュー指摘 #3）
    const { data: success, error: rpcError } = await adminClient.rpc(
      "withdraw_user_style_template",
      {
        p_template_id: id,
        p_actor_id: user.id,
        p_metadata: { source: "api" },
      }
    );

    if (rpcError) {
      console.error("[submissions DELETE] RPC failed", rpcError);
      return jsonError(copy.withdrawFailed, "INSPIRE_WITHDRAW_FAILED", 500);
    }
    if (!success) {
      return jsonError(copy.templateNotFound, "INSPIRE_TEMPLATE_NOT_FOUND", 404);
    }

    return NextResponse.json({ success: true, action: "withdrawn" });
  }

  // removed / withdrawn には何もしない（既に終端状態）
  return jsonError(copy.withdrawFailed, "INSPIRE_TEMPLATE_TERMINAL_STATE", 409);
}
