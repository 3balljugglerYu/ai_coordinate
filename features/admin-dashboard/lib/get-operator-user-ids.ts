import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminPreviewUserIds, getAdminUserIds } from "@/lib/env";
import { listAnalyticsExcludedUserIds } from "./analytics-exclusion-repository";
import { mergeOperatorUserIds } from "./operator-exclusion";

/**
 * 運営とみなす user_id の一覧(ADR-002)。
 *
 * 4系統あり、どれか1つだけを見ると取りこぼす。
 *  - `ADMIN_USER_IDS`           : requireAdmin が使う正本。admin 画面を触る人
 *  - `ADMIN_PREVIEW_USER_IDS`   : admin_only コンテンツの閲覧権限。**公開前のテスト生成をする**
 *  - `admin_users` テーブル      : 一部の DB RPC が参照する別系統
 *  - `analytics_excluded_users` : 上のどれにも入らない内部アカウント(審査用・本人の別名など)。
 *                                 管理画面の「集計から除く」で足す(2026-10-26 に追加)
 *
 * 和集合を取るのは安全側に倒すため。運営を実ユーザーとして数えるより、
 * 実ユーザーを1人取りこぼす方が KPI の誤読は小さい(母数が数十人規模のため
 * 「運営が混ざって完走率が上振れる」方が実害が大きい)。
 *
 * ## 読めなかったとき
 *
 * 既定では、DB 参照に失敗しても読めた分だけで続行する。ダッシュボード全体を
 * 落とすほどの話ではなく、除外が一部欠けたことは呼び出し側が
 * 「運営N名を除外中」の表示で気づける。
 *
 * `strict: true` のときは throw する。概要(売上のツリーなど)は、内部アカウントが
 * まざった数を正しい数のように見せるより、「取得できませんでした」と出すほうがよい。
 */
export async function getOperatorUserIds(
  options: { strict?: boolean } = {},
): Promise<string[]> {
  const strict = options.strict === true;
  const envIds = mergeOperatorUserIds(
    getAdminUserIds(),
    getAdminPreviewUserIds(),
  );

  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient();
  } catch (error) {
    if (strict) throw error;
    console.error("[operator ids] admin client failed:", error);
    return envIds;
  }

  const [adminUserIds, excludedUserIds] = await Promise.all([
    readSource("admin_users", () => readAdminUsers(supabase), strict),
    readSource(
      "analytics_excluded_users",
      () => listAnalyticsExcludedUserIds(supabase),
      strict,
    ),
  ]);

  return mergeOperatorUserIds(envIds, adminUserIds, excludedUserIds);
}

/**
 * 「集計から除く」の画面では外せない人(env の2つと admin_users)。
 * この画面で一覧から外しても、ここに入っている人は除かれたままになる。
 * 一覧の表を読み直さずに数えるため、表は読まない。
 */
export async function getBuiltInOperatorUserIds(): Promise<string[]> {
  const envIds = mergeOperatorUserIds(getAdminUserIds(), getAdminPreviewUserIds());
  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient();
  } catch (error) {
    console.error("[operator ids] admin client failed:", error);
    return envIds;
  }
  const adminUserIds = await readSource(
    "admin_users",
    () => readAdminUsers(supabase),
    false,
  );
  return mergeOperatorUserIds(envIds, adminUserIds);
}

async function readAdminUsers(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("admin_users").select("user_id");
  if (error) {
    throw new Error(`admin_users の取得に失敗しました: ${error.message}`);
  }
  return (data ?? [])
    .map((row) => (row as { user_id: string | null }).user_id)
    .filter((id): id is string => typeof id === "string");
}

async function readSource(
  label: string,
  read: () => Promise<string[]>,
  strict: boolean,
): Promise<string[]> {
  try {
    return await read();
  } catch (error) {
    if (strict) throw error;
    console.error(`[operator ids] ${label} lookup failed:`, error);
    return [];
  }
}
