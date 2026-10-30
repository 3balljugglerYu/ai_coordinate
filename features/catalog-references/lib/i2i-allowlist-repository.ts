import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 見本(参照画像)つきのカタログを作れる人(i2i_catalog_allowlist)の管理。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md Phase 2・ADR-001
 * - 運営が人を選んで足す・外す。空なら誰も使えない(判定は lib/auth/i2i-catalog.ts・fail-closed)
 * - user_id は auth.users(id)。表示名とアイコンは profiles.user_id で突き合わせる
 * - 運営だけの操作なので service role(createAdminClient)で動かす
 * - updated_at は表のトリガーが書く
 */

export interface I2iAllowlistMember {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  note: string | null;
  addedAt: string;
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

/** 全員(有効・無効)を profiles と突き合わせて返す(足した順の新しい順)。 */
export async function listI2iAllowlist(client?: SupabaseClient): Promise<I2iAllowlistMember[]> {
  const supabase = getSupabase(client);
  const { data: rows, error } = await supabase
    .from("i2i_catalog_allowlist")
    .select("user_id, is_active, note, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[i2i-allowlist] list error:", error);
    throw new Error("見本を使える人の一覧の取得に失敗しました");
  }

  const list = (rows ?? []) as Array<{
    user_id: string;
    is_active: boolean;
    note: string | null;
    created_at: string;
  }>;
  if (list.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("nickname, avatar_url, user_id")
    .in(
      "user_id",
      list.map((row) => row.user_id),
    );
  if (profileError) {
    console.error("[i2i-allowlist] profiles error:", profileError);
    throw new Error("見本を使える人の一覧の取得に失敗しました");
  }

  const byUserId = new Map(
    ((profiles ?? []) as Array<{ nickname: string | null; avatar_url: string | null; user_id: string }>).map(
      (profile) => [profile.user_id, profile] as const,
    ),
  );

  return list.map((row) => {
    const profile = byUserId.get(row.user_id);
    return {
      userId: row.user_id,
      nickname: profile?.nickname ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      isActive: row.is_active,
      note: row.note,
      addedAt: row.created_at,
    };
  });
}

/**
 * 足す(何度呼んでも同じ)。新しく足したら reactivated=false、すでにいた人を有効に戻したら true。
 * - 先に足してみて、すでに行があれば(user_id の UNIQUE)、is_active=true に戻すだけにする。
 *   同じ人をほぼ同時に足しても失敗しない
 * - 有効に戻すとき、足した人(added_by)は残す。note は今回指定されたときだけ上書きする
 */
export async function addI2iAllowlistMember(
  params: { userId: string; note?: string | null; addedBy?: string | null },
  client?: SupabaseClient,
): Promise<{ reactivated: boolean }> {
  const supabase = getSupabase(client);

  const { error: insertError } = await supabase.from("i2i_catalog_allowlist").insert({
    user_id: params.userId,
    is_active: true,
    note: params.note ?? null,
    added_by: params.addedBy ?? null,
  });
  if (!insertError) {
    return { reactivated: false };
  }
  if (insertError.code !== "23505") {
    console.error("[i2i-allowlist] add(insert) error:", insertError);
    throw new Error("見本を使える人の追加に失敗しました");
  }

  const patch: { is_active: boolean; note?: string | null } = { is_active: true };
  if (params.note != null) {
    patch.note = params.note;
  }
  const { error } = await supabase
    .from("i2i_catalog_allowlist")
    .update(patch)
    .eq("user_id", params.userId);
  if (error) {
    console.error("[i2i-allowlist] add(reactivate) error:", error);
    throw new Error("見本を使える人の追加に失敗しました");
  }
  return { reactivated: true };
}

/** 有効・無効の切り替え(無効にすると一時的に使えなくなる)。一覧にいなければ false。 */
export async function setI2iAllowlistActive(
  userId: string,
  isActive: boolean,
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("i2i_catalog_allowlist")
    .update({ is_active: isActive })
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    console.error("[i2i-allowlist] set active error:", error);
    throw new Error("見本を使える人の更新に失敗しました");
  }
  return (data ?? []).length > 0;
}

/** 一覧から消す。一覧にいなければ false。 */
export async function removeI2iAllowlistMember(userId: string, client?: SupabaseClient): Promise<boolean> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("i2i_catalog_allowlist")
    .delete()
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    console.error("[i2i-allowlist] remove error:", error);
    throw new Error("見本を使える人の削除に失敗しました");
  }
  return (data ?? []).length > 0;
}

/**
 * 実在する人か(profiles に行があるか)。DB のエラーは投げる
 * (「見つからない」と取り違えて、運営が ID の間違いだと思い込まないように)。
 */
export async function profileExistsForI2iAllowlist(
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
    console.error("[i2i-allowlist] profile exists error:", error);
    throw new Error("利用者の確認に失敗しました");
  }
  return data !== null;
}
