import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminPreviewUserIds, getAdminUserIds } from "@/lib/env";
import { mergeOperatorUserIds } from "./operator-exclusion";

/**
 * 運営とみなす user_id の一覧(ADR-002)。
 *
 * 3系統あり、どれか1つだけを見ると取りこぼす。
 *  - `ADMIN_USER_IDS`         : requireAdmin が使う正本。admin 画面を触る人
 *  - `ADMIN_PREVIEW_USER_IDS` : admin_only コンテンツの閲覧権限。**公開前のテスト生成をする**
 *  - `admin_users` テーブル    : 一部の DB RPC が参照する別系統
 *
 * 和集合を取るのは安全側に倒すため。運営を実ユーザーとして数えるより、
 * 実ユーザーを1人取りこぼす方が KPI の誤読は小さい(母数が数十人規模のため
 * 「運営が混ざって完走率が上振れる」方が実害が大きい)。
 *
 * DB 参照に失敗しても env のぶんだけで続行する。ダッシュボード全体を
 * 落とすほどの話ではなく、除外が一部欠けたことは呼び出し側が
 * 「運営N名を除外中」の表示で気づける。
 */
export async function getOperatorUserIds(): Promise<string[]> {
  const envIds = mergeOperatorUserIds(
    getAdminUserIds(),
    getAdminPreviewUserIds(),
  );

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("admin_users").select("user_id");
    if (error) {
      console.error("[collection kpi] admin_users lookup failed:", error);
      return envIds;
    }
    return mergeOperatorUserIds(
      envIds,
      (data ?? []).map((row) => row.user_id as string | null),
    );
  } catch (error) {
    console.error("[collection kpi] admin_users lookup threw:", error);
    return envIds;
  }
}
