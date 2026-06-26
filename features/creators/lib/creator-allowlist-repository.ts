import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 招待クリエイター(creator_looks_allowlist)管理のためのリポジトリ。
 * - allowlist は「プロンプトを申請できる人」かつ「プリセットのクリエイター(提供者クレジット)選択肢」の母集団。
 * - allowlist.user_id は auth.users(id)。表示名/アイコンは profiles.user_id で突き合わせる。
 * - admin 専用操作のため service role(createAdminClient)で実行する。
 */

export interface CreatorAllowlistMember {
  /** auth.users.id(= allowlist.user_id)。プリセットのクレジットは profiles.id を使うので別途 profileId も返す。 */
  userId: string;
  /** profiles.id(= style_presets.provider_user_id に入る値)。profile 未作成なら null。 */
  profileId: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  note: string | null;
  invitedAt: string | null;
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

/** allowlist 全件(active + inactive)を profiles と突き合わせて返す(invited_at 降順)。 */
export async function listCreatorAllowlist(
  client?: SupabaseClient
): Promise<CreatorAllowlistMember[]> {
  const supabase = getSupabase(client);
  const { data: rows, error } = await supabase
    .from("creator_looks_allowlist")
    .select("user_id, is_active, note, invited_at")
    .order("invited_at", { ascending: false });
  if (error) {
    console.error("[creator-allowlist] list error:", error);
    throw new Error("招待クリエイター一覧の取得に失敗しました");
  }

  const list = (rows ?? []) as Array<{
    user_id: string;
    is_active: boolean;
    note: string | null;
    invited_at: string | null;
  }>;
  if (list.length === 0) return [];

  const userIds = list.map((r) => r.user_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url, user_id")
    .in("user_id", userIds);
  if (profileError) {
    console.error("[creator-allowlist] profiles error:", profileError);
    throw new Error("招待クリエイター一覧の取得に失敗しました");
  }

  const byUserId = new Map(
    (profiles ?? []).map((p) => {
      const row = p as {
        id: string;
        nickname: string | null;
        avatar_url: string | null;
        user_id: string;
      };
      return [row.user_id, row] as const;
    })
  );

  return list.map((r) => {
    const profile = byUserId.get(r.user_id);
    return {
      userId: r.user_id,
      profileId: profile?.id ?? null,
      nickname: profile?.nickname ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      isActive: r.is_active,
      note: r.note,
      invitedAt: r.invited_at,
    };
  });
}

/**
 * メンバー追加(冪等)。
 * - 既存行があれば is_active=true に戻すのみ(既存の note / added_by / invited_at は保全。
 *   note は今回明示された場合のみ上書き)。
 * - 行が無ければ新規 insert する。
 * upsert(onConflict) は conflict 時に payload 全カラムを UPDATE して note/added_by を破壊するため使わない。
 */
export async function addCreatorAllowlistMember(
  params: { userId: string; note?: string | null; addedBy?: string | null },
  client?: SupabaseClient
): Promise<void> {
  const supabase = getSupabase(client);

  const { data: existing, error: selectError } = await supabase
    .from("creator_looks_allowlist")
    .select("user_id")
    .eq("user_id", params.userId)
    .maybeSingle();
  if (selectError) {
    console.error("[creator-allowlist] add(select) error:", selectError);
    throw new Error("招待クリエイターの追加に失敗しました");
  }

  if (existing) {
    // 再有効化: is_active のみ確実に戻す。note は今回指定された時だけ上書き(既存を壊さない)。
    const patch: { is_active: boolean; note?: string | null } = { is_active: true };
    if (params.note != null) {
      patch.note = params.note;
    }
    const { error } = await supabase
      .from("creator_looks_allowlist")
      .update(patch)
      .eq("user_id", params.userId);
    if (error) {
      console.error("[creator-allowlist] add(reactivate) error:", error);
      throw new Error("招待クリエイターの追加に失敗しました");
    }
    return;
  }

  const { error } = await supabase.from("creator_looks_allowlist").insert({
    user_id: params.userId,
    is_active: true,
    note: params.note ?? null,
    added_by: params.addedBy ?? null,
  });
  if (error) {
    console.error("[creator-allowlist] add(insert) error:", error);
    throw new Error("招待クリエイターの追加に失敗しました");
  }
}

/** 有効/無効の切替。 */
export async function setCreatorAllowlistActive(
  userId: string,
  isActive: boolean,
  client?: SupabaseClient
): Promise<void> {
  const supabase = getSupabase(client);
  const { error } = await supabase
    .from("creator_looks_allowlist")
    .update({ is_active: isActive })
    .eq("user_id", userId);
  if (error) {
    console.error("[creator-allowlist] set active error:", error);
    throw new Error("招待クリエイターの更新に失敗しました");
  }
}

/** 物理削除。 */
export async function removeCreatorAllowlistMember(
  userId: string,
  client?: SupabaseClient
): Promise<void> {
  const supabase = getSupabase(client);
  const { error } = await supabase
    .from("creator_looks_allowlist")
    .delete()
    .eq("user_id", userId);
  if (error) {
    console.error("[creator-allowlist] remove error:", error);
    throw new Error("招待クリエイターの削除に失敗しました");
  }
}

/** 指定 user_id に profiles が存在するか(追加時の検証用)。 */
export async function profileExistsForUserId(
  userId: string,
  client?: SupabaseClient
): Promise<boolean> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[creator-allowlist] profile exists error:", error);
    return false;
  }
  return Boolean(data);
}
