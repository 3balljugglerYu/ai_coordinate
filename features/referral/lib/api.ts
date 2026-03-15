/**
 * リファラル（紹介）特典機能のAPIクライアント関数
 */

import type {
  GenerateReferralCodeResponse,
  CheckFirstLoginResponse,
} from "../types";

interface ReferralApiMessages {
  generateCodeFailed?: string;
  checkBonusFailed?: string;
}

/**
 * 紹介コードを生成または取得
 */
export async function generateReferralCode(
  messages?: ReferralApiMessages
): Promise<GenerateReferralCodeResponse> {
  const response = await fetch("/api/referral/generate", {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.error || messages?.generateCodeFailed || "紹介コードの生成に失敗しました"
    );
  }

  return response.json() as Promise<GenerateReferralCodeResponse>;
}

/**
 * 初回ログイン時の紹介特典をチェック
 * メールアドレス確認完了後の初回ログイン成功時に呼び出す
 */
export async function checkReferralBonusOnFirstLogin(
  referralCode?: string,
  messages?: ReferralApiMessages
): Promise<CheckFirstLoginResponse> {
  const query = referralCode
    ? `?${new URLSearchParams({ ref: referralCode }).toString()}`
    : "";
  const response = await fetch(`/api/referral/check-first-login${query}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.error || messages?.checkBonusFailed || "紹介特典の確認に失敗しました"
    );
  }

  return response.json() as Promise<CheckFirstLoginResponse>;
}
