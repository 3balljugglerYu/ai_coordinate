import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSignupSource } from "@/features/auth/lib/signup-source";

const REFERRAL_METADATA_UPDATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function isWithinReferralMetadataUpdateWindow(
  user: {
    created_at?: string;
  }
) {
  if (!user.created_at) return false;

  const createdAtMs = Date.parse(user.created_at);
  if (Number.isNaN(createdAtMs)) return false;

  return Date.now() - createdAtMs <= REFERRAL_METADATA_UPDATE_WINDOW_MS;
}

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
  const signupSource = parseSignupSource(
    requestUrl.searchParams.get("signup_source")
  );
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  // X OAuth識別用パラメータ（state 500文字制限回避のため）
  // 参考: https://github.com/supabase/auth/issues/2340
  const oauthFlowType = requestUrl.searchParams.get("p");
  const isXOAuth = oauthFlowType === "x";
  const shouldUseOAuthCompletePageByQuery =
    isXOAuth || oauthFlowType === "oauth" || Boolean(referralCode);

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
    if (sessionData.user) {
      const shouldUpdateRecentUserMetadata =
        isWithinReferralMetadataUpdateWindow(sessionData.user);

      const nextUserMetadata: Record<string, string> = {};

      if (
        referralCode &&
        !sessionData.user.user_metadata?.referral_code &&
        shouldUpdateRecentUserMetadata
      ) {
        nextUserMetadata.referral_code = referralCode;
      }

      if (
        signupSource &&
        !sessionData.user.user_metadata?.signup_source &&
        shouldUpdateRecentUserMetadata
      ) {
        nextUserMetadata.signup_source = signupSource;
      }

      if (Object.keys(nextUserMetadata).length > 0) {
        try {
          const { error: updateError } = await supabase.auth.updateUser({
            data: nextUserMetadata,
          });
          if (updateError) {
            console.error(
              "Failed to update user metadata during auth callback:",
              updateError
            );
          }
        } catch (err) {
          console.error(
            "Failed to update user metadata during auth callback:",
            err
          );
        }
      }

      if (signupSource && shouldUpdateRecentUserMetadata) {
        try {
          const { error: profileUpdateError } = await supabase
            .from("profiles")
            .update({ signup_source: signupSource })
            .eq("user_id", sessionData.user.id)
            .is("signup_source", null);

          if (profileUpdateError) {
            console.error(
              "Failed to update profile signup_source during auth callback:",
              profileUpdateError
            );
          }
        } catch (err) {
          console.error(
            "Failed to update profile signup_source during auth callback:",
            err
          );
        }
      }

      // 2. 紹介特典チェックは /auth/x-complete 側で実行する
      // callback内でRPCをawaitすると、リダイレクト応答が遅延するため。
    }

    // 新規ユーザーの場合、user_creditsテーブルが自動的に作成される（トリガーで実装済み）

    // 成功: リダイレクト先を決定
    // x-forwarded-hostヘッダーを確認（ロードバランサー経由の場合）
    const forwardedHost = request.headers.get("x-forwarded-host");
    const isLocalEnv = process.env.NODE_ENV === "development";
    
    // OAuth completeページではlocalStorageまたはクエリ経由で紹介コード処理を行う
    const oauthCompleteQuery = new URLSearchParams();
    if (referralCode) {
      oauthCompleteQuery.set("ref", referralCode);
    }
    if (next && next !== "/") {
      oauthCompleteQuery.set("next", next);
    }
    const oauthCompleteSuffix =
      oauthCompleteQuery.size > 0 ? `?${oauthCompleteQuery.toString()}` : "";
    const hasReferralCodeInMetadata = Boolean(
      sessionData.user?.user_metadata?.referral_code
    );
    const shouldUseOAuthCompletePage =
      shouldUseOAuthCompletePageByQuery || hasReferralCodeInMetadata;
    const redirectPath = shouldUseOAuthCompletePage
      ? `/auth/x-complete${oauthCompleteSuffix}`
      : next;
    
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
