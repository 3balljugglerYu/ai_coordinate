import type { Locale } from "@/i18n/config";

export const referralRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    referralGenerateFailed: "紹介コードの生成に失敗しました",
    referralCheckFailed: "紹介特典の確認に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  ko: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  "zh-CN": {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  "zh-TW": {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  es: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  pt: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  fr: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  de: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  it: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  id: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  th: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  vi: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  hi: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
  ar: {
    authRequired: "You need to be logged in.",
    referralGenerateFailed: "Failed to generate the referral code.",
    referralCheckFailed: "Failed to verify the referral bonus.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getReferralRouteCopy(locale: Locale) {
  return referralRouteCopy[locale];
}
