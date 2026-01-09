/**
 * リファラル（紹介）特典機能のAPIクライアント関数
 */

export interface GenerateReferralCodeResponse {
  referral_code: string | null;
  error?: string;
}

export interface CheckFirstLoginResponse {
  bonus_granted: number;
  error?: string;
}

/**
 * 紹介コードを生成または取得
 */
export async function generateReferralCode(): Promise<GenerateReferralCodeResponse> {
  const response = await fetch("/api/referral/generate", {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "紹介コードの生成に失敗しました");
  }

  return response.json() as Promise<GenerateReferralCodeResponse>;
}

/**
 * 初回ログイン時の紹介特典をチェック
 * メールアドレス確認完了後の初回ログイン成功時に呼び出す
 */
export async function checkReferralBonusOnFirstLogin(): Promise<CheckFirstLoginResponse> {
  const response = await fetch("/api/referral/check-first-login", {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "紹介特典の確認に失敗しました");
  }

  return response.json() as Promise<CheckFirstLoginResponse>;
}

