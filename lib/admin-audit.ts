import { createAdminClient } from "@/lib/supabase/admin";

export type AdminAuditAction =
  | "user_suspend"
  | "user_reactivate"
  | "bonus_grant"
  | "deduction"
  | "moderation_approve"
  | "moderation_reject";

export interface AdminAuditLogParams {
  adminUserId: string;
  actionType: AdminAuditAction;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 管理者操作を監査ログに記録する
 * 失敗してもログ記録でエラーにしない（本処理を優先）
 */
export async function logAdminAction(params: AdminAuditLogParams): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("admin_audit_log").insert({
      admin_user_id: params.adminUserId,
      action_type: params.actionType,
      target_type: params.targetType,
      target_id: params.targetId ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (err) {
    console.error("[AdminAudit] Failed to log action:", err);
  }
}
