"use client";

import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { getSiteUrlForClient } from "@/lib/public-env";
import { checkReferralBonusOnFirstLogin } from "@/features/referral/lib/api";
import type { SignupSource } from "./signup-source";
import {
  DEFAULT_LOCALE,
  getLocaleCookieMaxAge,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
} from "@/i18n/config";

/**
 * クライアントサイド認証ヘルパー関数
 */

const authErrorCopy = {
  ja: {
    invalidCredentials: "メールアドレスまたはパスワードが間違っています。",
    sessionMissing:
      "認証セッションが見つかりません。パスワード再設定リンクの有効期限が切れている可能性があります。もう一度パスワードリセットメールを送信してください。",
    linkExpired:
      "リンクの有効期限が切れています。パスワード再設定メールを再度送信してください。",
    invalidLink:
      "無効なリンクです。パスワード再設定メールを再度送信してください。",
    passwordMustDiffer:
      "新しいパスワードは現在のパスワードと異なるものを入力してください。",
    passwordBlocked:
      "セキュリティ上の理由により、このパスワードは設定できません。",
    passwordTooShort: "パスワードは8文字以上で入力してください。",
    passwordWeak:
      "パスワードが弱すぎます。より複雑なパスワードを設定してください。",
    emailNotConfirmed:
      "メールアドレスが確認されていません。確認メールをチェックしてください。",
    emailNotConfirmedDetailed:
      "メールアドレスが確認されていません。確認メールをチェックしてください。メールが届いていない場合は、再送信を試してください。",
    networkError:
      "ネットワークエラーが発生しました。インターネット接続を確認してください。",
    securityRetrySeconds:
      "セキュリティ上の理由により、{seconds}秒後に再度お試しください。",
    securityRetryGeneric:
      "セキュリティ上の理由により、しばらく時間をおいてから再度お試しください。",
    tooManyRequests:
      "リクエストが多すぎます。しばらく時間をおいてから再度お試しください。",
    signUpFailed: "サインアップに失敗しました",
    signInFailed: "ログインに失敗しました",
    deactivateFailed: "アカウント削除の申請に失敗しました",
    reactivateFailed: "アカウントの復帰に失敗しました",
  },
  en: {
    invalidCredentials: "Incorrect email address or password.",
    sessionMissing:
      "No authentication session was found. Your password reset link may have expired. Please request a new reset email.",
    linkExpired:
      "This link has expired. Please request a new password reset email.",
    invalidLink:
      "This link is invalid. Please request a new password reset email.",
    passwordMustDiffer:
      "Your new password must be different from your current password.",
    passwordBlocked:
      "For security reasons, this password cannot be used.",
    passwordTooShort: "Password must be at least 8 characters.",
    passwordWeak:
      "This password is too weak. Please choose a stronger password.",
    emailNotConfirmed:
      "Your email address has not been confirmed yet. Please check your inbox.",
    emailNotConfirmedDetailed:
      "Your email address has not been confirmed yet. Please check your inbox. If you don't see the email, try requesting it again.",
    networkError:
      "A network error occurred. Please check your internet connection.",
    securityRetrySeconds:
      "For security reasons, please try again in {seconds} seconds.",
    securityRetryGeneric:
      "For security reasons, please wait a little before trying again.",
    tooManyRequests:
      "Too many requests. Please wait a little before trying again.",
    signUpFailed: "Failed to sign up.",
    signInFailed: "Failed to log in.",
    deactivateFailed: "Failed to request account deletion.",
    reactivateFailed: "Failed to restore the account.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

function resolveClientLocale(): Locale {
  if (typeof document === "undefined") {
    return DEFAULT_LOCALE;
  }

  const localeValue = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE}=`))
    ?.split("=")[1];

  return isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
}

/**
 * Supabaseのエラーメッセージを日本語に変換
 */
function isAlreadyRegisteredSignUpError(error: {
  message?: string | null;
  code?: string | null;
}): boolean {
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();

  // Supabaseの設定によっては既存メールに対して明示エラーが返るため、
  // その場合も同一レスポンスに寄せてアカウント列挙を防ぐ。
  return (
    code === "user_already_exists" ||
    message.includes("user already registered") ||
    message.includes("already been registered") ||
    (message.includes("email") &&
      (message.includes("already in use") ||
        message.includes("already exists") ||
        message.includes("already taken") ||
        message.includes("already registered")))
  );
}

function translateAuthError(errorMessage: string, locale: Locale = resolveClientLocale()): string {
  const errorLower = errorMessage.toLowerCase();
  const copy = authErrorCopy[locale];

  // ログイン認証エラー
  if (
    errorLower.includes("invalid login credentials") ||
    errorLower.includes("invalid credentials") ||
    errorLower.includes("email or password") ||
    (errorLower.includes("invalid") && errorLower.includes("password"))
  ) {
    return copy.invalidCredentials;
  }

  // パスワードリセット関連のエラー
  if (errorLower.includes("auth session missing") || errorLower.includes("session missing")) {
    return copy.sessionMissing;
  }

  if (errorLower.includes("token has expired") || errorLower.includes("expired")) {
    return copy.linkExpired;
  }

  if (errorLower.includes("invalid token")) {
    return copy.invalidLink;
  }

  if (errorLower.includes("password")) {
    // 新しいパスワードが古いパスワードと同じ場合
    if (
      errorLower.includes("different from the old") ||
      errorLower.includes("should be different") ||
      (errorLower.includes("different") && errorLower.includes("old password"))
    ) {
      return copy.passwordMustDiffer;
    }
    // 漏洩パスワード（HaveIBeenPwned等で検出）
    if (
      errorLower.includes("pwned") ||
      errorLower.includes("known to be weak") ||
      errorLower.includes("easy to guess")
    ) {
      return copy.passwordBlocked;
    }
    if (errorLower.includes("too short") || errorLower.includes("minimum")) {
      return copy.passwordTooShort;
    }
    if (errorLower.includes("weak") || errorLower.includes("common")) {
      return copy.passwordWeak;
    }
  }

  // メール確認関連
  if (errorLower.includes("email not confirmed") || errorLower.includes("not confirmed")) {
    return copy.emailNotConfirmed;
  }

  // その他の一般的なエラー
  if (errorLower.includes("network") || errorLower.includes("fetch")) {
    return copy.networkError;
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
      return copy.securityRetrySeconds.replace("{seconds}", seconds);
    }
    return copy.securityRetryGeneric;
  }

  if (errorLower.includes("rate limit") || errorLower.includes("too many")) {
    return copy.tooManyRequests;
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
  referralCode?: string,
  signupSource?: SignupSource | null
) {
  const supabase = createClient();
  const locale = resolveClientLocale();

  const signUpOptions: {
    emailRedirectTo: string;
    data?: { referral_code?: string; signup_source?: SignupSource };
  } = {
    emailRedirectTo: getSiteUrlForClient() + "/auth/callback",
  };

  if (referralCode || signupSource) {
    signUpOptions.data = {};

    if (referralCode) {
      signUpOptions.data.referral_code = referralCode;
    }

    if (signupSource) {
      signUpOptions.data.signup_source = signupSource;
    }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: signUpOptions,
  });

  if (error) {
    if (isAlreadyRegisteredSignUpError(error)) {
      console.info("Sign up attempted with an existing email. Returning generic success response.");
      return data;
    }

    // より詳細なエラー情報を提供
    console.error("Sign up error:", {
      message: error.message,
      status: error.status,
      name: error.name,
    });
    // エラーメッセージを日本語に変換
    const translatedMessage = translateAuthError(
      error.message || authErrorCopy[locale].signUpFailed,
      locale
    );
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
  const locale = resolveClientLocale();

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
      throw new Error(authErrorCopy[locale].emailNotConfirmedDetailed);
    }

    // エラーメッセージを日本語に変換
    const translatedMessage = translateAuthError(
      error.message || authErrorCopy[locale].signInFailed,
      locale
    );
    throw new Error(translatedMessage);
  }

  // 初回ログイン成功時（メール確認完了後）に紹介特典をチェック
  // 時間ベースの初回ログイン判定は不安定なため削除。
  // RPCがべき等であるため、メール確認済みのユーザーがログインするたびにチェックを試みる。
  // パフォーマンスが懸念される場合は、user_metadataにフラグを立てるなどの方法を検討してください。
  if (data.user && data.user.email_confirmed_at) {
    // エラーは静かに処理（ユーザー体験を損なわない）
    await checkReferralBonusOnFirstLogin().catch((err) => {
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
  const locale = resolveClientLocale();

  const siteUrl = getSiteUrlForClient();
  const redirectUrl =
    redirectTo ?? `${siteUrl.replace(/\/$/, "")}/reset-password/confirm`;

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  });

  if (error) {
    // エラーメッセージを日本語に変換
    const translatedMessage = translateAuthError(error.message, locale);
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
  const locale = resolveClientLocale();

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    // エラーメッセージを日本語に変換
    const translatedMessage = translateAuthError(error.message, locale);
    throw new Error(translatedMessage);
  }

  return data;
}

/**
 * サインアウト
 */
export async function signOut() {
  const supabase = createClient();
  const locale = resolveClientLocale();

  const { error } = await supabase.auth.signOut();

  if (error) {
    // エラーメッセージを日本語に変換
    const translatedMessage = translateAuthError(error.message, locale);
    throw new Error(translatedMessage);
  }

  if (typeof document !== "undefined") {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${getLocaleCookieMaxAge()}; samesite=lax`;
  }
}

interface DeactivateAccountParams {
  confirmText: string;
  password?: string;
}

export async function deactivateAccount(params: DeactivateAccountParams): Promise<{
  success: true;
  status: string;
  scheduled_for: string | null;
}> {
  const locale = resolveClientLocale();
  const response = await fetch("/api/account/deactivate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(params),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || authErrorCopy[locale].deactivateFailed);
  }

  return payload;
}

export async function reactivateAccount(): Promise<{
  success: true;
  status: string;
}> {
  const locale = resolveClientLocale();
  const response = await fetch("/api/account/reactivate", {
    method: "POST",
    credentials: "include",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || authErrorCopy[locale].reactivateFailed);
  }

  return payload;
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
 * OAuthプロバイダーの型定義
 */
export type OAuthProvider = "google" | "github" | "x";

/**
 * OAuthサインイン（Google, GitHub, X/Twitter）
 * @param referralCode 紹介コード（オプション）
 * 
 * 注意: X（Twitter）OAuthの場合、Supabase Authのstateパラメータが
 * X.comの500文字制限に近づくため、redirectToを最小化しています。
 * 参考: https://github.com/supabase/auth/issues/2340
 */
export async function signInWithOAuth(
  provider: OAuthProvider,
  redirectTo?: string,
  referralCode?: string,
  signupSource?: SignupSource | null
) {
  const supabase = createClient();
  const locale = resolveClientLocale();

  // サイトURLの取得（環境変数優先、開発環境はlocalhost）
  const siteUrl = getSiteUrlForClient();

  // 過去フローの値が残っていると誤判定の原因になるため、
  // OAuth開始時に毎回localStorageをクリアしてから必要値のみ保存する。
  if (typeof window !== "undefined") {
    localStorage.removeItem("x_oauth_redirect");
    localStorage.removeItem("x_oauth_referral");
  }
  
  // X（Twitter）の場合、stateパラメータの500文字制限を回避するため
  // redirectToを最小化（紹介コードとnextはlocalStorageに保存）
  // 参考: https://github.com/supabase/auth/issues/2340
  if (provider === "x") {
    // リダイレクト先と紹介コードをlocalStorageに保存
    if (typeof window !== "undefined") {
      if (redirectTo && redirectTo !== "/") {
        localStorage.setItem("x_oauth_redirect", redirectTo);
      }
      if (referralCode) {
        localStorage.setItem("x_oauth_referral", referralCode);
      }
    }
    
    // 最小限のコールバックURLを使用
    // p=x パラメータでX OAuthを識別し、コールバック後に /auth/x-complete へリダイレクト
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: (() => {
          const callbackUrl = new URL(`${siteUrl}/auth/callback`);
          callbackUrl.searchParams.set("p", "x");

          if (signupSource) {
            callbackUrl.searchParams.set("signup_source", signupSource);
          }

          return callbackUrl.toString();
        })(),
      },
    });

    if (error) {
      const translatedMessage = translateAuthError(error.message, locale);
      throw new Error(translatedMessage);
    }

    return data;
  }

  // Google/GitHubの場合は従来通り
  // 紹介コード付きOAuthはフォールバック用にlocalStorageへ保存し、
  // callback後に /auth/x-complete で確実に紹介チェックを実行する。
  if (typeof window !== "undefined" && referralCode) {
    if (redirectTo && redirectTo !== "/") {
      localStorage.setItem("x_oauth_redirect", redirectTo);
    }
    localStorage.setItem("x_oauth_referral", referralCode);
  }

  const callbackUrl = new URL(`${siteUrl}/auth/callback`);
  callbackUrl.searchParams.set("next", redirectTo || "/");
  if (referralCode) {
    callbackUrl.searchParams.set("p", "oauth");
  }
  if (signupSource) {
    callbackUrl.searchParams.set("signup_source", signupSource);
  }
  
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
    const translatedMessage = translateAuthError(error.message, locale);
    throw new Error(translatedMessage);
  }

  return data;
}
