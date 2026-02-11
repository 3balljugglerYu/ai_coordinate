/**
 * リファラル（紹介）特典機能の型定義
 */

export interface GenerateReferralCodeResponse {
  referral_code: string | null;
  error?: string;
}

export type ReferralCheckReasonCode =
  | "granted"
  | "already_granted"
  | "window_expired"
  | "missing_code"
  | "invalid_code"
  | "transient_error"
  | "unauthorized";

export interface CheckFirstLoginResponse {
  bonus_granted: number;
  reason_code: ReferralCheckReasonCode;
  error?: string;
}
