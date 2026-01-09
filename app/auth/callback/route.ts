import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth Callback Handler
 * 
 * OAuthプロバイダーからのコールバックを処理し、
 * セッションを確立してユーザーをリダイレクトします。
 * 紹介コードが含まれている場合、新規ユーザーのメタデータに保存します。
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";
  const referralCode = requestUrl.searchParams.get("ref");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  // エラーハンドリング
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent(
        errorDescription || error
      )}`
    );
  }

  // 認証コードを使用してセッションを確立
  if (code) {
    const supabase = await createClient();
    const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("Code exchange error:", exchangeError);
      return NextResponse.redirect(
        `${requestUrl.origin}/login?error=${encodeURIComponent(
          "認証に失敗しました"
        )}`
      );
    }

    // 新規ユーザーの初回ログイン処理
    if (sessionData.user) {
      const createdAt = new Date(sessionData.user.created_at).getTime();
      // `last_sign_in_at` はこのコールバックで更新されるため `created_at` と近いはず
      const lastSignInAt = sessionData.user.last_sign_in_at
        ? new Date(sessionData.user.last_sign_in_at).getTime()
        : createdAt;

      // 作成時刻と最終ログイン時刻が非常に近い場合、初回ログインと判断（許容誤差: 60秒）
      const isFirstLogin = Math.abs(createdAt - lastSignInAt) < 60 * 1000;

      if (isFirstLogin) {
        // 1. 紹介コードをメタデータに保存（未設定の場合のみ）
        if (referralCode && !sessionData.user.user_metadata?.referral_code) {
          // エラーはログに記録するが、認証フローはブロックしない
          supabase.auth
            .updateUser({
              data: { referral_code: referralCode },
            })
            .catch((updateError) => {
              console.error(
                "Failed to update user metadata with referral code:",
                updateError
              );
            });
        }

        // 2. 紹介特典をチェック（べき等性が保証されているため、複数回呼び出しても問題ない）
        // OAuthユーザーは通常 email_confirmed_at が設定されている
        if (sessionData.user.email_confirmed_at) {
          // エラーはログに記録するが、認証フローはブロックしない
          supabase.rpc("check_and_grant_referral_bonus_on_first_login", {
            p_user_id: sessionData.user.id,
          }).catch((bonusError) => {
            console.error(
              "Failed to check referral bonus on first login:",
              bonusError
            );
          });
        }
      }
    }

    // 新規ユーザーの場合、user_creditsテーブルが自動的に作成される（トリガーで実装済み）

    // 成功: nextパラメータで指定された場所にリダイレクト
    return NextResponse.redirect(`${requestUrl.origin}${next}`);
  }

  // コードがない場合はエラー
  return NextResponse.redirect(
    `${requestUrl.origin}/login?error=${encodeURIComponent(
      "認証コードが見つかりません"
    )}`
  );
}
