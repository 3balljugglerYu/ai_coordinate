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
 * 申請者が自分のテンプレートを操作する。状態によって挙動が変わる:
 * - draft                → 完全削除（行 + Storage オブジェクト）
 * - pending / visible    → moderation_status = 'withdrawn' に変更（行は残す、取り下げ）
 * - removed / withdrawn  → 完全削除（行 + Storage オブジェクト）
 *                          リジェクト済み or 取り下げ済みのレコードを永続的に消す
 *
 * REQ-S-09 参照。
 * 申請者ホワイトリスト判定はかけない（取り下げ・削除は常に可能、計画 §5 Phase 2 の方針）。
 */

/**
 * テンプレートに紐づく Storage オブジェクト（テンプレ画像 + プレビュー 2 枚）を一括削除する。
 * Storage 失敗は次回 cleanup cron が拾うため fatal にしない。
 */
async function removeTemplateStorageObjects(
  adminClient: ReturnType<typeof createAdminClient>,
  template: {
    storage_path: string | null;
    preview_openai_image_url: string | null;
    preview_gemini_image_url: string | null;
  }
): Promise<void> {
  const paths = [
    template.storage_path,
    template.preview_openai_image_url,
    template.preview_gemini_image_url,
  ].filter((p): p is string => typeof p === "string" && p.length > 0);

  if (paths.length === 0) return;

  const { error } = await adminClient.storage.from("style-templates").remove(paths);
  if (error) {
    console.warn(
      "[submissions DELETE] storage remove failed (non-fatal)",
      { error: error.message, paths }
    );
  }
}

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

  // draft / removed / withdrawn は完全削除（行 + Storage）
  if (
    template.moderation_status === "draft" ||
    template.moderation_status === "removed" ||
    template.moderation_status === "withdrawn"
  ) {
    await removeTemplateStorageObjects(adminClient, template);

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

  // pending / visible は取り下げ（withdrawn に状態変更、行は残す）
  if (
    template.moderation_status === "pending" ||
    template.moderation_status === "visible"
  ) {
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

  // 未知の状態（CHECK 制約上ここには来ないが防御）
  return jsonError(copy.withdrawFailed, "INSPIRE_TEMPLATE_TERMINAL_STATE", 409);
}
