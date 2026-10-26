import { connection, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSignupSource } from "@/features/auth/lib/signup-source";
import {
  AD_SIGNUP_COOKIE,
  AD_SIGNUP_COOKIE_MAX_AGE_SECONDS,
  AD_SIGNUP_COOKIE_PATH,
  AD_SIGNUP_COOKIE_SAME_SITE,
  AD_SIGNUP_REPORTED_METADATA_KEY,
  shouldReportAdSignup,
} from "@/features/analytics/lib/ad-signup-signal";
import { toSafeRedirectPath } from "@/lib/security/safe-redirect-path";

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
  await connection();
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  // 移る先はこのサイトの中のパスだけ(「@evil.com」「//evil.com」などで、よそへ移されないように)
  const next = toSafeRedirectPath(requestUrl.searchParams.get("next"));
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
    // 広告の Pixel に「登録した」を知らせるか(1人1回。下の updateUser で送った印を残せたときだけ)
    let shouldSetAdSignupCookie = false;
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

      const shouldReportSignup = shouldReportAdSignup(sessionData.user, Date.now());
      if (shouldReportSignup) {
        nextUserMetadata[AD_SIGNUP_REPORTED_METADATA_KEY] = new Date().toISOString();
      }

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
          } else if (shouldReportSignup) {
            // 送った印を残せたときだけ送る(残せないと、次のログインでもう一度送ってしまう)
            shouldSetAdSignupCookie = true;
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
    if (next !== "/") {
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
    
    const response = isLocalEnv
      ? // 開発環境ではoriginをそのまま使用
        NextResponse.redirect(`${requestUrl.origin}${redirectPath}`)
      : forwardedHost
        ? // 本番環境でロードバランサー経由の場合
          NextResponse.redirect(`https://${forwardedHost}${redirectPath}`)
        : NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);

    // 新しく登録した人にだけ、広告の Pixel に「登録した」を知らせる印を付ける(中身は "1" だけ)
    if (shouldSetAdSignupCookie) {
      response.cookies.set(AD_SIGNUP_COOKIE, "1", {
        maxAge: AD_SIGNUP_COOKIE_MAX_AGE_SECONDS,
        path: AD_SIGNUP_COOKIE_PATH,
        sameSite: AD_SIGNUP_COOKIE_SAME_SITE,
        secure: !isLocalEnv,
        httpOnly: false,
      });
    }

    return response;
  }

  // コードがない場合はエラー
  return NextResponse.redirect(
    `${requestUrl.origin}/login?error=${encodeURIComponent(
      "認証コードが見つかりません"
    )}`
  );
}
