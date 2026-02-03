import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAdminUserIds } from "@/lib/env";

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
