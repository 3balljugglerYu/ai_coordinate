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

    // 新規ユーザーの場合、紹介コードをメタデータに保存
    // 新規ユーザーかどうかは、user_metadataが空か、created_atが最近かを確認
    if (referralCode && sessionData.user) {
      // ユーザーが新規作成されたかどうかを確認（created_atが最近（例: 5分以内）の場合）
      const userCreatedAt = new Date(sessionData.user.created_at);
      const now = new Date();
      const minutesSinceCreation = (now.getTime() - userCreatedAt.getTime()) / 1000 / 60;

      // 5分以内に作成されたユーザーは新規ユーザーとみなす
      if (minutesSinceCreation < 5) {
        try {
          // メタデータに紹介コードを追加
          await supabase.auth.updateUser({
            data: {
              referral_code: referralCode,
            },
          });
        } catch (updateError) {
          // エラーはログに記録のみ（認証フローは継続）
          console.error("Failed to update user metadata with referral code:", updateError);
        }
      }
    }

    // 新規ユーザーの場合、user_creditsテーブルが自動的に作成される（トリガーで実装済み）

    // OAuth認証の場合、初回ログイン成功時に紹介特典をチェック
    if (sessionData.user && sessionData.user.email_confirmed_at) {
      try {
        // 初回ログイン判定: email_confirmed_atが最近（5分以内）に更新された場合
        const confirmedAt = new Date(sessionData.user.email_confirmed_at);
        const now = new Date();
        const minutesSinceConfirmation = (now.getTime() - confirmedAt.getTime()) / 1000 / 60;

        // 5分以内に確認された場合は初回ログインとみなす
        if (minutesSinceConfirmation < 5) {
          // 紹介特典をチェック（べき等性が保証されているため、複数回呼び出しても問題ない）
          const { error: bonusError } = await supabase.rpc(
            "check_and_grant_referral_bonus_on_first_login",
            {
              p_user_id: sessionData.user.id,
            }
          );

          if (bonusError) {
            // エラーはログに記録のみ（認証フローは継続）
            console.error("Failed to check referral bonus on first login:", bonusError);
          }
        }
      } catch (err) {
        // エラーはログに記録のみ（認証フローは継続）
        console.error("Error checking referral bonus on first login:", err);
      }
    }

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
