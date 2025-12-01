"use client";

import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { getSiteUrlForClient } from "@/lib/env";

/**
 * クライアントサイド認証ヘルパー関数
 */

/**
 * メールアドレスとパスワードでサインアップ
 */
export async function signUp(email: string, password: string) {
  const supabase = createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getSiteUrlForClient() + "/auth/callback",
    },
  });

  if (error) {
    // より詳細なエラー情報を提供
    console.error("Sign up error:", {
      message: error.message,
      status: error.status,
      name: error.name,
    });
    throw new Error(error.message || "サインアップに失敗しました");
  }

  // メール確認が必要な場合の情報を返す
  if (data.user && !data.user.email_confirmed_at) {
    console.log(
      "User created but email confirmation required:",
      data.user.email
    );
  }

  return data;
}

/**
 * メールアドレスとパスワードでサインイン
 */
export async function signIn(email: string, password: string) {
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // より詳細なエラー情報を提供
    console.error("Sign in error:", {
      message: error.message,
      status: error.status,
      name: error.name,
    });

    // メール確認が必要な場合の特別なエラーメッセージ
    if (error.message.includes("Email not confirmed") || error.status === 401) {
      throw new Error(
        "メールアドレスが確認されていません。確認メールをチェックしてください。メールが届いていない場合は、再送信を試してください。"
      );
    }

    throw new Error(error.message || "ログインに失敗しました");
  }

  return data;
}

/**
 * パスワードリセットメールを送信
 *
 * 指定したメールアドレス宛てに、Supabase Auth 経由で
 * パスワードリセット用のメールを送信します。
 *
 * redirectTo には、パスワード再設定フォームのURL
 * （例: /reset-password/confirm）を指定します。
 */
export async function resetPasswordForEmail(
  email: string,
  redirectTo?: string
) {
  const supabase = createClient();

  const siteUrl = getSiteUrlForClient();
  const redirectUrl =
    redirectTo ?? `${siteUrl.replace(/\/$/, "")}/reset-password/confirm`;

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * 新しいパスワードを設定
 *
 * パスワードリセットリンクから遷移してきたブラウザコンテキストで実行することで、
 * 現在のユーザーのパスワードを更新します。
 */
export async function updatePassword(newPassword: string) {
  const supabase = createClient();

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * サインアウト
 */
export async function signOut() {
  const supabase = createClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * 現在のユーザーを取得
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

/**
 * 現在のセッションを取得
 */
export async function getCurrentSession(): Promise<Session | null> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}

/**
 * 認証状態の変更を監視
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  const supabase = createClient();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  return subscription;
}

/**
 * OAuthサインイン（Google, GitHub, Twitter）
 */
export async function signInWithOAuth(
  provider: "google" | "github" | "twitter",
  redirectTo?: string
) {
  const supabase = createClient();

  // サイトURLの取得（環境変数優先、開発環境はlocalhost）
  const siteUrl = getSiteUrlForClient();
  const callbackUrl = new URL(`${siteUrl}/auth/callback`);
  callbackUrl.searchParams.set("next", redirectTo || "/coordinate");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

