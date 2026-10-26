import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "./fetch-all-rows";

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

/** profiles の .in(...) を分けて引く数(URL の長さと 1,000行の上限に当たらないように)。 */
const PROFILE_LOOKUP_CHUNK = 200;

/**
 * 足す前に、そのユーザーが profiles にいるか。
 * ⚠️ 読めなかったときは false ではなく throw する。false にすると、障害なのに
 * 「該当するユーザーが見つかりません」(400)と出て、いる人を足せないと誤解させる。
 */
export async function profileExistsForExclusion(
  userId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`profiles の取得に失敗しました: ${error.message}`);
  }
  return Boolean(data);
}

interface ExclusionRow {
  /** user_id の別名(fetchAllRows のカーソル用) */
  id: string;
  reason: string;
  added_by: string | null;
  created_at: string;
}

/**
 * 表を全件たどる。PostgREST は既定で 1,000行しか返さず、エラーにもならない(#579)。
 * 除く人が欠けると、内部アカウントが実ユーザーとして数えられ、strict でも気づけないので、
 * user_id のカーソルで最後まで読む。
 */
async function fetchAllExclusionRows(supabase: SupabaseClient): Promise<ExclusionRow[]> {
  const { data, error } = await fetchAllRows<ExclusionRow>((cursor, size) => {
    let query = supabase
      .from("analytics_excluded_users")
      .select("id:user_id, reason, added_by, created_at");
    if (cursor) query = query.gt("user_id", cursor);
    return query.order("user_id", { ascending: true }).limit(size);
  });
  if (error) {
    throw new Error(`analytics_excluded_users の取得に失敗しました: ${error.message}`);
  }
  return data ?? [];
}

/** 除く人の user_id だけ(集計用)。読めなければ throw する。 */
export async function listAnalyticsExcludedUserIds(
  client?: SupabaseClient,
): Promise<string[]> {
  const rows = await fetchAllExclusionRows(getSupabase(client));
  return rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** 一覧(新しい順)。ニックネームは profiles から付ける。 */
export async function listAnalyticsExclusions(
  client?: SupabaseClient,
): Promise<AnalyticsExclusion[]> {
  const supabase = getSupabase(client);
  let rows: ExclusionRow[];
  try {
    rows = await fetchAllExclusionRows(supabase);
  } catch (error) {
    console.error("[analytics-exclusions] list error:", error);
    throw new Error("集計から除く一覧の取得に失敗しました");
  }
  if (rows.length === 0) return [];
  // 新しい順(全件たどるために user_id 順で取っているので、ここで並べ直す)
  rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const ids = Array.from(
    new Set(
      rows.flatMap((row) => (row.added_by ? [row.id, row.added_by] : [row.id])),
    ),
  );
  const nicknames = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += PROFILE_LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + PROFILE_LOOKUP_CHUNK);
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, nickname")
      .in("user_id", chunk);
    if (profileError) {
      console.error("[analytics-exclusions] profiles error:", profileError);
      throw new Error("集計から除く一覧の取得に失敗しました");
    }
    for (const p of profiles ?? []) {
      const row = p as { user_id: string; nickname: string | null };
      nicknames.set(row.user_id, row.nickname);
    }
  }

  return rows.map((row) => ({
    userId: row.id,
    nickname: nicknames.get(row.id) ?? null,
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
