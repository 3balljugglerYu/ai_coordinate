import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 集計から除くアカウント(analytics_excluded_users)の読み書き。
 *
 * env(ADMIN_USER_IDS / ADMIN_PREVIEW_USER_IDS)と admin_users に入っていない
 * 内部アカウント(審査用・本人の別名など)を、ここで足す。
 * getOperatorUserIds() がこの表も読む。表は service_role だけが触れる。
 */

export interface AnalyticsExclusion {
  userId: string;
  nickname: string | null;
  reason: string;
  addedBy: string | null;
  addedByNickname: string | null;
  createdAt: string;
}

/** 同じ人がすでに入っているとき。API は 409 を返す。 */
export class AnalyticsExclusionExistsError extends Error {
  constructor() {
    super("すでに集計から除いています");
    this.name = "AnalyticsExclusionExistsError";
  }
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

/** 除く人の user_id だけ(集計用)。読めなければ throw する。 */
export async function listAnalyticsExcludedUserIds(
  client?: SupabaseClient,
): Promise<string[]> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("analytics_excluded_users")
    .select("user_id");
  if (error) {
    throw new Error(`analytics_excluded_users の取得に失敗しました: ${error.message}`);
  }
  return (data ?? [])
    .map((row) => (row as { user_id: string | null }).user_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** 一覧(新しい順)。ニックネームは profiles から付ける。 */
export async function listAnalyticsExclusions(
  client?: SupabaseClient,
): Promise<AnalyticsExclusion[]> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("analytics_excluded_users")
    .select("user_id, reason, added_by, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[analytics-exclusions] list error:", error);
    throw new Error("集計から除く一覧の取得に失敗しました");
  }

  const rows = (data ?? []) as Array<{
    user_id: string;
    reason: string;
    added_by: string | null;
    created_at: string;
  }>;
  if (rows.length === 0) return [];

  const ids = Array.from(
    new Set(
      rows.flatMap((row) => (row.added_by ? [row.user_id, row.added_by] : [row.user_id])),
    ),
  );
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, nickname")
    .in("user_id", ids);
  if (profileError) {
    console.error("[analytics-exclusions] profiles error:", profileError);
    throw new Error("集計から除く一覧の取得に失敗しました");
  }
  const nicknames = new Map(
    (profiles ?? []).map((p) => {
      const row = p as { user_id: string; nickname: string | null };
      return [row.user_id, row.nickname] as const;
    }),
  );

  return rows.map((row) => ({
    userId: row.user_id,
    nickname: nicknames.get(row.user_id) ?? null,
    reason: row.reason,
    addedBy: row.added_by,
    addedByNickname: row.added_by ? (nicknames.get(row.added_by) ?? null) : null,
    createdAt: row.created_at,
  }));
}

/** 足す。すでに入っていれば AnalyticsExclusionExistsError(今の行は変えない)。 */
export async function addAnalyticsExclusion(
  params: { userId: string; reason: string; addedBy: string },
  client?: SupabaseClient,
): Promise<void> {
  const supabase = getSupabase(client);
  const { error } = await supabase.from("analytics_excluded_users").insert({
    user_id: params.userId,
    reason: params.reason,
    added_by: params.addedBy,
  });
  if (error) {
    // 23505 = unique_violation(主キーの重複)
    if (error.code === "23505") {
      throw new AnalyticsExclusionExistsError();
    }
    console.error("[analytics-exclusions] add error:", error);
    throw new Error("集計から除く一覧への追加に失敗しました");
  }
}

/** 外す。消した行があれば true。 */
export async function removeAnalyticsExclusion(
  userId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("analytics_excluded_users")
    .delete()
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    console.error("[analytics-exclusions] remove error:", error);
    throw new Error("集計から除く一覧からの削除に失敗しました");
  }
  return (data ?? []).length > 0;
}
