"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { checkReferralBonusOnFirstLogin } from "@/features/referral/lib/api";

/**
 * OAuth完了ページ（X / Google / GitHub）
 * 
 * OAuth callbackで保存されたリダイレクト先・紹介コードを
 * localStorageから取得して処理します。
 * 
 * 参考: https://github.com/supabase/auth/issues/2340
 */
export default function XOAuthCompletePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const processXOAuthCompletion = async () => {
      // localStorageから保存された値を取得
      const storedRedirectTo = localStorage.getItem("x_oauth_redirect");
      const storedReferralCode = localStorage.getItem("x_oauth_referral");
      const redirectToFromQuery = searchParams.get("next");
      const referralCodeFromQuery = searchParams.get("ref");
      const redirectTo = storedRedirectTo || redirectToFromQuery;
      const referralCode = storedReferralCode || referralCodeFromQuery;

      // 使用後は削除
      localStorage.removeItem("x_oauth_redirect");
      localStorage.removeItem("x_oauth_referral");

      // 紹介コードがある場合、APIを呼び出して処理
      if (referralCode) {
        try {
          const result = await checkReferralBonusOnFirstLogin(referralCode);

          if (result.reason_code === "transient_error") {
            console.warn(
              "[X OAuth] Referral check returned transient_error, retrying once"
            );
            const retryResult =
              await checkReferralBonusOnFirstLogin(referralCode);
            if (retryResult.reason_code === "transient_error") {
              console.error(
                "[X OAuth] Referral check failed after retry:",
                retryResult
              );
            }
          } else if (
            result.reason_code !== "granted" &&
            result.reason_code !== "already_granted"
          ) {
            console.info(
              "[X OAuth] Referral check completed without grant:",
              result
            );
          }
        } catch (err) {
          console.error("[X OAuth] Failed to process referral code:", err);
        }
      }

      // リダイレクト先へ遷移
      const destination =
        redirectTo && redirectTo.startsWith("/") ? redirectTo : "/";
      router.replace(destination);
      router.refresh();
    };

    processXOAuthCompletion();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">ログイン処理中...</p>
      </div>
    </div>
  );
}
