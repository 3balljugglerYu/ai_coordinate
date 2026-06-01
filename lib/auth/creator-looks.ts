/**
 * Creator Looks 機能のアクセス制御ヘルパー
 *
 * 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-006, REQ-009, REQ-017
 *
 * Stage 別ガード:
 *   - Stage 1: CREATOR_LOOKS_ENABLED=true + admin role のみ (allowlist テーブルは空が前提)
 *   - Stage 2: CREATOR_LOOKS_ENABLED=true + (admin OR creator_looks_allowlist.is_active=true)
 *   - Stage 3: CREATOR_LOOKS_ENABLED=true で全認証ユーザー開放 (= 別 PR で gate を緩める)
 *
 * 重要:
 *   - env が false なら admin であっても false を返す (= 緊急停止可能)
 *   - allowlist は fail-closed: テーブルが空なら判定は false (= INSPIRE_SUBMISSION_ALLOWED_USER_IDS の
 *     fail-open とは意図的に逆向き)
 *   - 「クライアントに env を露出させない」原則を守るため、isCreatorLooksFeatureEnabled は server-only
 */

import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUserIds, isCreatorLooksFeatureEnabled } from "@/lib/env";

/**
 * ユーザーが admin role を持つか (= env ADMIN_USER_IDS 経由)
 */
export function isAdminUser(user: Pick<User, "id"> | null | undefined): boolean {
  if (!user) {
    return false;
  }
  const adminUserIds = getAdminUserIds();
  if (adminUserIds.length === 0) {
    return false;
  }
  return adminUserIds.includes(user.id);
}

/**
 * Creator Looks 機能の招待リストに含まれるか (Stage 2 用)
 *
 * 戻り値:
 *   - true  = creator_looks_allowlist にレコードが存在し is_active=true
 *   - false = レコード無し / is_active=false / DB エラー (fail-closed)
 *
 * Stage 1 ではテーブルが空であることを前提とするため、常に false を返すパスを通る。
 */
export async function isInCreatorLooksAllowlist(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("creator_looks_allowlist")
      .select("user_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      // fail-closed: DB エラー時は false を返す (= 意図せぬ開放を防ぐ)
      console.warn("[creator-looks] allowlist check failed:", error.message);
      return false;
    }

    return data !== null;
  } catch (e) {
    console.warn("[creator-looks] allowlist check threw:", e);
    return false;
  }
}

/**
 * Creator Looks 機能をこのユーザーが使えるか (= UI/API の入口ガード)
 *
 * 判定順:
 *   1. env CREATOR_LOOKS_ENABLED が false なら誰でも false
 *   2. user が null なら false
 *   3. admin ならば true
 *   4. Stage 2 用 allowlist にあれば true
 *   5. それ以外は false
 *
 * 注意:
 *   - この関数は **server-side でのみ呼ぶ** (= env を読むため)
 *   - クライアントで gating したい場合は Server Component で判定結果を props で渡す
 */
export async function isCreatorLooksEnabledForUser(
  user: Pick<User, "id"> | null | undefined,
): Promise<boolean> {
  if (!isCreatorLooksFeatureEnabled()) {
    return false;
  }
  if (!user) {
    return false;
  }
  if (isAdminUser(user)) {
    return true;
  }
  return isInCreatorLooksAllowlist(user.id);
}
