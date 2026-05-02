import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  getAdminUserIds,
  getInspireSubmissionAllowedUserIds,
} from "@/lib/env";

/**
 * 認証ヘルパー関数
 */

/**
 * 現在のユーザーを取得
 * React Cacheでラップして、同一リクエスト内での重複実行を防止
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
});

/**
 * 認証されたユーザーセッションを取得
 */
export async function getSession() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}

/**
 * 認証が必要なページで使用
 * 未認証の場合はログインページにリダイレクト
 */
export async function requireAuth() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/**
 * 管理者権限が必要なAPI Route Handlerで使用
 * 未認証または管理者でない場合は403エラーを返す
 * @returns 管理者ユーザーオブジェクト
 * @throws NextResponse (403 Forbidden) - 未認証または管理者でない場合
 */
export async function requireAdmin() {
  const user = await getUser();

  if (!user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUserIds = getAdminUserIds();
  
  if (adminUserIds.length === 0) {
    // 管理者IDが設定されていない場合は、すべてのユーザーを管理者として扱わない
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!adminUserIds.includes(user.id)) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return user;
}

/**
 * Inspire 申請者ホワイトリストの判定（ADR-010）
 *
 * 既存 requireAdmin と異なり env 空 = 全許可（fail-open / allow-all）。
 * 段階開放ゲートのための一時的な仕組みであり、最終形は全認証ユーザーへの開放。
 * env を空にする = 全公開する、という運用フローを成立させるために fail-open。
 *
 * 本番デプロイ前チェックリスト: 環境変数 INSPIRE_SUBMISSION_ALLOWED_USER_IDS が
 * 運営の user_id を含む形で設定済みかを必ず確認すること（意図せぬ全公開を防ぐ）。
 */
export function isInspireSubmitterAllowed(userId: string): boolean {
  const allowed = getInspireSubmissionAllowedUserIds();
  if (allowed.length === 0) {
    // env 空 = 全許可（ADR-010 参照、requireAdmin の deny-all とは意図的に逆向き）
    return true;
  }
  return allowed.includes(userId);
}
