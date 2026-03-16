import type { Locale } from "@/i18n/config";

export const creditsRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    packageIdRequired: "packageId が必要です",
    invalidPackage: "指定されたパッケージが見つかりません",
    mockPurchaseFailed: "ペルコイン購入処理に失敗しました",
    invalidConsumeRequest:
      "generationId と正の percoins を指定してください",
    imageNotFound: "画像が見つかりません",
    forbidden: "この画像を操作する権限がありません",
    insufficientBalance: "ペルコイン残高が不足しています",
    consumeFailed: "ペルコインの消費に失敗しました",
    balanceFetchFailed: "ペルコイン残高の取得に失敗しました",
    expiringBatchesFetchFailed: "失効予定の無償ペルコイン一覧の取得に失敗しました",
    expiringCountFetchFailed: "今月失効予定の無償ペルコイン数の取得に失敗しました",
    unexpectedError: "予期しないエラーが発生しました",
    checkoutPrepareFailed:
      "決済の準備中にエラーが発生しました。しばらく時間をおいて再度お試しください。",
    checkoutInvalidRequest: "リクエストの内容に問題があります。",
    checkoutConfigError: "決済の設定に問題があります。管理者にお問い合わせください。",
    checkoutRateLimited:
      "リクエストが多すぎます。しばらく時間をおいて再度お試しください。",
    checkoutServiceUnavailable:
      "決済サービスに接続できません。しばらく時間をおいて再度お試しください。",
    checkoutPermissionDenied: "この操作は許可されていません。",
    checkoutDuplicateRequest:
      "同じリクエストが重複しています。ページを更新して再度お試しください。",
    checkoutLoginRequired: "ログインが必要です",
    checkoutUrlFailed: "Checkout URLの作成に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    packageIdRequired: "A packageId is required.",
    invalidPackage: "The selected package could not be found.",
    mockPurchaseFailed: "Failed to complete the mock purchase.",
    invalidConsumeRequest:
      "generationId and a positive percoin amount are required.",
    imageNotFound: "The image could not be found.",
    forbidden: "You do not have permission to access this image.",
    insufficientBalance: "You do not have enough Percoins.",
    consumeFailed: "Failed to consume Percoins.",
    balanceFetchFailed: "Failed to load the Percoin balance.",
    expiringBatchesFetchFailed: "Failed to load expiring free Percoin batches.",
    expiringCountFetchFailed: "Failed to load this month's expiring free Percoin count.",
    unexpectedError: "An unexpected error occurred.",
    checkoutPrepareFailed:
      "Something went wrong while preparing checkout. Please try again in a little while.",
    checkoutInvalidRequest: "The request parameters are invalid.",
    checkoutConfigError: "There is a problem with the payment configuration.",
    checkoutRateLimited:
      "Too many requests were sent. Please try again in a little while.",
    checkoutServiceUnavailable:
      "The payment service is currently unavailable. Please try again in a little while.",
    checkoutPermissionDenied: "This action is not allowed.",
    checkoutDuplicateRequest:
      "This request appears to be duplicated. Refresh the page and try again.",
    checkoutLoginRequired: "You need to be logged in.",
    checkoutUrlFailed: "Failed to create the checkout URL.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getCreditsRouteCopy(locale: Locale) {
  return creditsRouteCopy[locale];
}
