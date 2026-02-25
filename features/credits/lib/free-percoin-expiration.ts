"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";

export type FreePercoinBatchExpiring = {
  id: string;
  user_id: string;
  remaining_amount: number;
  expire_at: string;
  source: string;
};

/**
 * 期限が近い無償コイン一覧を取得
 * React.cache でラップして同一リクエスト内の重複取得を防止
 * 認証必須
 */
export const getFreePercoinBatchesExpiring = cache(async (): Promise<
  FreePercoinBatchExpiring[]
> => {
  const user = await getUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_free_percoin_batches_expiring", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("get_free_percoin_batches_expiring error:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    remaining_amount: Number(row.remaining_amount ?? 0),
    expire_at: String(row.expire_at ?? ""),
    source: String(row.source ?? ""),
  }));
});

/**
 * 今月末に失効予定のコイン数を取得（JST 基準）
 * React.cache でラップして同一リクエスト内の重複取得を防止
 * 認証必須
 */
export const getExpiringThisMonthCount = cache(async (): Promise<number> => {
  const user = await getUser();
  if (!user) return 0;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_expiring_this_month_count", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("get_expiring_this_month_count error:", error);
    return 0;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return Number((row as { expiring_this_month?: number })?.expiring_this_month ?? 0);
});

/**
 * 失効通知対象ユーザー一覧を取得（7日以内に失効するバッチを持つユーザー）
 * 管理者のみ呼び出し可能
 */
export async function getExpirationNotificationTargets(): Promise<string[]> {
  const user = await getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const adminUserIds = getAdminUserIds();
  if (adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    throw new Error("Forbidden");
  }

  // service_role のみ実行可能のため createAdminClient を使用
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_expiration_notification_targets");

  if (error) {
    console.error("get_expiration_notification_targets error:", error);
    return [];
  }

  return (data ?? []).map((row: { user_id: string }) => String(row.user_id));
}
