/**
 * リファラル（紹介）特典機能の型定義
 */

export interface GenerateReferralCodeResponse {
  referral_code: string | null;
  error?: string;
}

export interface CheckFirstLoginResponse {
  bonus_granted: number;
  error?: string;
}

