"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * X (Twitter) OAuth完了ページ
 * 
 * X OAuthのstate パラメータ500文字制限を回避するため、
 * リダイレクト先と紹介コードをlocalStorageから取得して処理します。
 * 
 * 参考: https://github.com/supabase/auth/issues/2340
 */
export default function XOAuthCompletePage() {
  const router = useRouter();

  useEffect(() => {
    const processXOAuthCompletion = async () => {
      // localStorageから保存された値を取得
      const redirectTo = localStorage.getItem("x_oauth_redirect");
      const referralCode = localStorage.getItem("x_oauth_referral");

      // 使用後は削除
      localStorage.removeItem("x_oauth_redirect");
      localStorage.removeItem("x_oauth_referral");

      // 紹介コードがある場合、APIを呼び出して処理
      if (referralCode) {
        try {
          await fetch("/api/referral/check-first-login", {
            method: "GET",
            credentials: "include",
          });
        } catch (err) {
          console.error("[X OAuth] Failed to process referral code:", err);
        }
      }

      // リダイレクト先へ遷移
      const destination = redirectTo || "/";
      router.replace(destination);
      router.refresh();
    };

    processXOAuthCompletion();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">ログイン処理中...</p>
      </div>
    </div>
  );
}
