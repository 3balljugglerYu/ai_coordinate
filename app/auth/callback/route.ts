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
  // X OAuth識別用パラメータ（state 500文字制限回避のため）
  // 参考: https://github.com/supabase/auth/issues/2340
  const isXOAuth = requestUrl.searchParams.get("p") === "x";

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

    // 紹介コードと紹介特典の処理
    // 時間ベースの初回ログイン判定は不安定なため削除。
    // 後続の処理（メタデータ更新、RPC呼び出し）はべき等性が保証されているため、毎回実行しても問題ない。
    // これにより、メール/パスワード認証のフローとも一貫性が保たれる。
    if (sessionData.user) {
      // 1. 紹介コードをメタデータに保存（未設定の場合のみ）
      if (referralCode && !sessionData.user.user_metadata?.referral_code) {
        // エラーはログに記録するが、認証フローはブロックしない
        void (async () => {
          try {
            const { error: updateError } = await supabase.auth.updateUser({
              data: { referral_code: referralCode },
            });
            if (updateError) {
              console.error(
                "Failed to update user metadata with referral code:",
                updateError
              );
            }
          } catch (err) {
            console.error(
              "Failed to update user metadata with referral code:",
              err
            );
          }
        })();
      }

      // 2. 紹介特典をチェック（べき等性が保証されているため、複数回呼び出しても問題ない）
      // OAuthユーザーは通常 email_confirmed_at が設定されている
      if (sessionData.user.email_confirmed_at) {
        // エラーはログに記録するが、認証フローはブロックしない
        void (async () => {
          try {
            const { error: bonusError } = await supabase.rpc(
              "check_and_grant_referral_bonus_on_first_login",
              {
                p_user_id: sessionData.user.id,
              }
            );
            if (bonusError) {
              console.error(
                "Failed to check referral bonus on first login:",
                bonusError
              );
            }
          } catch (err) {
            console.error(
              "Failed to check referral bonus on first login:",
              err
            );
          }
        })();
      }
    }

    // 新規ユーザーの場合、user_creditsテーブルが自動的に作成される（トリガーで実装済み）

    // 成功: リダイレクト先を決定
    // x-forwarded-hostヘッダーを確認（ロードバランサー経由の場合）
    const forwardedHost = request.headers.get("x-forwarded-host");
    const isLocalEnv = process.env.NODE_ENV === "development";
    
    // X OAuthの場合は /auth/x-complete へリダイレクト（localStorageの値を処理するため）
    const redirectPath = isXOAuth ? "/auth/x-complete" : next;
    
    if (isLocalEnv) {
      // 開発環境ではoriginをそのまま使用
      return NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
    } else if (forwardedHost) {
      // 本番環境でロードバランサー経由の場合
      return NextResponse.redirect(`https://${forwardedHost}${redirectPath}`);
    } else {
      return NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
    }
  }

  // コードがない場合はエラー
  return NextResponse.redirect(
    `${requestUrl.origin}/login?error=${encodeURIComponent(
      "認証コードが見つかりません"
    )}`
  );
}
