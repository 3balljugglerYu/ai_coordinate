import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getInspireRouteCopy } from "@/features/inspire/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";
import { getStyleTemplateById } from "@/features/inspire/lib/repository";

const decisionSchema = z.object({
  action: z.enum(["approve", "reject", "unpublish"]),
  reason: z.string().max(500).optional().nullable(),
});

const ACTION_TO_AUDIT = {
  approve: "style_template_approve",
  reject: "style_template_reject",
  unpublish: "style_template_unpublish",
} as const;

const ACTION_TO_NOTIFICATION_TYPE = {
  approve: "style_template_approved",
  reject: "style_template_rejected",
  unpublish: "style_template_unpublished",
} as const;

/**
 * POST /api/admin/style-templates/[id]/decision
 *
 * admin が承認 / 差戻し / 非公開化を 1 トランザクションで適用する。
 * - apply_user_style_template_decision RPC で moderation_status と監査ログを atomic に更新
 * - admin_audit_log に横断検索用ログを追加
 * - notifications に直 INSERT で通知を発行（REQ-N-04 / REQ-N-01〜N-03）
 * - revalidateTag('home-user-style-templates') でホームカルーセルキャッシュを無効化
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = getInspireRouteCopy(getRouteLocale(request));

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const { id } = await params;
  if (!id) {
    return jsonError(copy.invalidRequest, "INSPIRE_INVALID_ID", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(copy.invalidRequest, "INSPIRE_INVALID_REQUEST", 400);
  }

  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      copy.decisionInvalidAction,
      "INSPIRE_INVALID_ACTION",
      400
    );
  }

  const { action, reason } = parsed.data;
  const adminClient = createAdminClient();

  // 申請者の user_id を取得（通知の recipient に使う）
  const { data: template, error: fetchError } = await getStyleTemplateById(
    adminClient,
    id
  );
  if (fetchError || !template) {
    return jsonError(
      copy.templateNotFound,
      "INSPIRE_TEMPLATE_NOT_FOUND",
      404
    );
  }

  // RPC: 状態更新 + style_template_audit_logs 挿入
  const now = new Date().toISOString();
  const { data: success, error: rpcError } = await adminClient.rpc(
    "apply_user_style_template_decision",
    {
      p_template_id: id,
      p_actor_id: adminUser.id,
      p_action: action,
      p_reason: reason ?? null,
      p_decided_at: now,
      p_metadata: { decided_at: now },
    }
  );

  if (rpcError) {
    console.error("[admin decision] RPC failed", rpcError);
    return jsonError(copy.decisionFailed, "INSPIRE_DECISION_FAILED", 500);
  }
  if (!success) {
    return jsonError(copy.templateNotFound, "INSPIRE_TEMPLATE_NOT_FOUND", 404);
  }

  // 横断監査ログ
  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: ACTION_TO_AUDIT[action],
    targetType: "style_template",
    targetId: id,
    metadata: { reason: reason ?? null },
  });

  // 通知の直 INSERT（REQ-N-04: create_notification RPC は迂回）
  const notificationType = ACTION_TO_NOTIFICATION_TYPE[action];
  const titleMap = {
    approve: "あなたのスタイルテンプレートが承認されました",
    reject: "スタイルテンプレートの申請が差し戻されました",
    unpublish: "公開中のスタイルテンプレートが非公開になりました",
  } as const;
  const bodyMap = {
    approve: "ホームのカルーセルに掲載されます。",
    reject: reason ? `理由: ${reason}` : "詳細は管理画面でご確認ください。",
    unpublish: reason ? `理由: ${reason}` : "詳細は管理画面でご確認ください。",
  } as const;

  const { error: notifyError } = await adminClient.from("notifications").insert({
    recipient_id: template.submitted_by_user_id,
    actor_id: adminUser.id,
    type: notificationType,
    entity_type: "style_template",
    entity_id: id,
    title: titleMap[action],
    body: bodyMap[action],
    data: { reason: reason ?? null, action },
  });

  if (notifyError) {
    console.warn("[admin decision] notification insert failed (non-fatal)", notifyError);
  }

  // ホームカルーセルキャッシュを無効化
  try {
    revalidateTag("home-user-style-templates", "max");
  } catch (err) {
    console.warn("[admin decision] revalidateTag failed (non-fatal)", err);
  }

  return NextResponse.json({
    success: true,
    action,
    moderation_status: action === "approve" ? "visible" : "removed",
  });
}
