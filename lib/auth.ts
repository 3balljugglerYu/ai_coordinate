import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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

