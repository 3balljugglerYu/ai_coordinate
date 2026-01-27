"use client";

import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { getSiteUrlForClient } from "@/lib/env";

/**
 * クライアントサイド認証ヘルパー関数
 */

/**
 * Supabaseのエラーメッセージを日本語に変換
 */
function translateAuthError(errorMessage: string): string {
  const errorLower = errorMessage.toLowerCase();

  // ログイン認証エラー
  if (
    errorLower.includes("invalid login credentials") ||
    errorLower.includes("invalid credentials") ||
    errorLower.includes("email or password") ||
    (errorLower.includes("invalid") && errorLower.includes("password"))
  ) {
    return "メールアドレスまたはパスワードが間違っています。";
  }

  // パスワードリセット関連のエラー
  if (errorLower.includes("auth session missing") || errorLower.includes("session missing")) {
    return "認証セッションが見つかりません。パスワード再設定リンクの有効期限が切れている可能性があります。もう一度パスワードリセットメールを送信してください。";
  }

  if (errorLower.includes("token has expired") || errorLower.includes("expired")) {
    return "リンクの有効期限が切れています。パスワード再設定メールを再度送信してください。";
  }

  if (errorLower.includes("invalid token")) {
    return "無効なリンクです。パスワード再設定メールを再度送信してください。";
  }

  if (errorLower.includes("password")) {
    // 新しいパスワードが古いパスワードと同じ場合
    if (
      errorLower.includes("different from the old") ||
      errorLower.includes("should be different") ||
      (errorLower.includes("different") && errorLower.includes("old password"))
    ) {
      return "新しいパスワードは現在のパスワードと異なるものを入力してください。";
    }
    if (errorLower.includes("too short") || errorLower.includes("minimum")) {
      return "パスワードは6文字以上で入力してください。";
    }
    if (errorLower.includes("weak") || errorLower.includes("common")) {
      return "パスワードが弱すぎます。より複雑なパスワードを設定してください。";
    }
  }

  // メール確認関連
  if (errorLower.includes("email not confirmed") || errorLower.includes("not confirmed")) {
    return "メールアドレスが確認されていません。確認メールをチェックしてください。";
  }

  // その他の一般的なエラー
  if (errorLower.includes("network") || errorLower.includes("fetch")) {
    return "ネットワークエラーが発生しました。インターネット接続を確認してください。";
  }

  // レート制限エラー（詳細なメッセージ）
  if (
    errorLower.includes("for security purposes") ||
    errorLower.includes("only request this after") ||
    (errorLower.includes("security") && errorLower.includes("after"))
  ) {
    // 秒数を抽出（例: "after 34 seconds"）
    const secondsMatch = errorMessage.match(/(\d+)\s*seconds?/i);
    if (secondsMatch) {
      const seconds = secondsMatch[1];
      return `セキュリティ上の理由により、${seconds}秒後に再度お試しください。`;
    }
    return "セキュリティ上の理由により、しばらく時間をおいてから再度お試しください。";
  }

  if (errorLower.includes("rate limit") || errorLower.includes("too many")) {
    return "リクエストが多すぎます。しばらく時間をおいてから再度お試しください。";
  }

  // デフォルト: 元のエラーメッセージを返す
  return errorMessage;
}

/**
 * メールアドレスとパスワードでサインアップ
 * @param referralCode 紹介コード（オプション）
 */
export async function signUp(
  email: string,
  password: string,
  referralCode?: string
) {
  const supabase = createClient();

  const signUpOptions: {
    emailRedirectTo: string;
    data?: { referral_code?: string };
  } = {
    emailRedirectTo: getSiteUrlForClient() + "/auth/callback",
  };

  // 紹介コードが存在する場合、options.dataに設定
  if (referralCode) {
    signUpOptions.data = {
      referral_code: referralCode,
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: signUpOptions,
  });

  if (error) {
    // より詳細なエラー情報を提供
    console.error("Sign up error:", {
      message: error.message,
      status: error.status,
      name: error.name,
    });
    // エラーメッセージを日本語に変換
    const translatedMessage = translateAuthError(error.message || "サインアップに失敗しました");
    throw new Error(translatedMessage);
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
 * 初回ログイン成功時（メール確認完了後）に紹介特典をチェック
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

    // エラーメッセージを日本語に変換
    const translatedMessage = translateAuthError(error.message || "ログインに失敗しました");
    throw new Error(translatedMessage);
  }

  // 初回ログイン成功時（メール確認完了後）に紹介特典をチェック
  // 時間ベースの初回ログイン判定は不安定なため削除。
  // RPCがべき等であるため、メール確認済みのユーザーがログインするたびにチェックを試みる。
  // パフォーマンスが懸念される場合は、user_metadataにフラグを立てるなどの方法を検討してください。
  if (data.user && data.user.email_confirmed_at) {
    // エラーは静かに処理（ユーザー体験を損なわない）
    await fetch("/api/referral/check-first-login", {
      method: "GET",
      credentials: "include",
    }).catch((err) => {
      console.error("[Referral Bonus] Failed to check on first login:", err);
    });
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
    // エラーメッセージを日本語に変換
    const translatedMessage = translateAuthError(error.message);
    throw new Error(translatedMessage);
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
    // エラーメッセージを日本語に変換
    const translatedMessage = translateAuthError(error.message);
    throw new Error(translatedMessage);
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
    // エラーメッセージを日本語に変換
    const translatedMessage = translateAuthError(error.message);
    throw new Error(translatedMessage);
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
 * OAuthサインイン（Google, GitHub, X/Twitter）
 * @param referralCode 紹介コード（オプション）
 */
export async function signInWithOAuth(
  provider: "google" | "github" | "x",
  redirectTo?: string,
  referralCode?: string
) {
  const supabase = createClient();

  // サイトURLの取得（環境変数優先、開発環境はlocalhost）
  const siteUrl = getSiteUrlForClient();
  const callbackUrl = new URL(`${siteUrl}/auth/callback`);
  callbackUrl.searchParams.set("next", redirectTo || "/");
  
  // 紹介コードが存在する場合、コールバックURLに含める
  if (referralCode) {
    callbackUrl.searchParams.set("ref", referralCode);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    // エラーメッセージを日本語に変換
    const translatedMessage = translateAuthError(error.message);
    throw new Error(translatedMessage);
  }

  return data;
}

