import type { Locale } from "@/i18n/config";

type SubscriptionRouteCopy = {
  authRequired: string;
  activeSubscriptionExists: string;
  activeSubscriptionNotFound: string;
  invalidPlan: string;
  invalidBillingInterval: string;
  noChangeRequested: string;
  intervalConfirmationRequired: string;
  checkoutUnavailable: string;
  checkoutUrlFailed: string;
  checkoutPrepareFailed: string;
  previewPrepareFailed: string;
  changePrepareFailed: string;
  changePaymentFailed: string;
  scheduledChangeNotFound: string;
  scheduledChangeCancelFailed: string;
  pendingCancellationNotFound: string;
  resumeCancellationFailed: string;
  portalUnavailable: string;
  portalSessionFailed: string;
  customerNotFound: string;
};

const COPY: Record<Locale, SubscriptionRouteCopy> = {
  ja: {
    authRequired: "ログインが必要です。",
    activeSubscriptionExists:
      "加入中または対応待ちのサブスクリプションがあります。プラン変更または請求情報の確認を利用してください。",
    activeSubscriptionNotFound:
      "変更できるアクティブなサブスクリプションが見つかりません。",
    invalidPlan: "サブスクプランが不正です。",
    invalidBillingInterval: "課金間隔が不正です。",
    noChangeRequested: "現在のプランと同じ内容です。",
    intervalConfirmationRequired: "請求間隔の変更には確認が必要です。",
    checkoutUnavailable:
      "サブスク決済の設定が未完了です。Stripe Price を確認してください。",
    checkoutUrlFailed: "Checkout URL の取得に失敗しました。",
    checkoutPrepareFailed: "サブスク Checkout の準備に失敗しました。",
    previewPrepareFailed: "変更内容の確認に失敗しました。",
    changePrepareFailed: "プラン変更に失敗しました。",
    changePaymentFailed:
      "支払いが完了しなかったため、プランは変更されませんでした。",
    scheduledChangeNotFound: "取り消せる予約変更が見つかりません。",
    scheduledChangeCancelFailed: "予約していたプラン変更を取り消せませんでした。",
    pendingCancellationNotFound: "取り消せる解約予定が見つかりません。",
    resumeCancellationFailed: "解約予定の取り消しに失敗しました。",
    portalUnavailable: "サブスク加入情報が見つかりません。",
    portalSessionFailed: "サブスク管理画面の準備に失敗しました。",
    customerNotFound: "Stripe Customer が見つかりません。",
  },
  en: {
    authRequired: "Login is required.",
    activeSubscriptionExists:
      "You already have a subscription that requires action. Please use the plan change flow or review your billing status.",
    activeSubscriptionNotFound:
      "No active subscription was found for plan changes.",
    invalidPlan: "Invalid subscription plan.",
    invalidBillingInterval: "Invalid billing interval.",
    noChangeRequested: "This matches your current plan.",
    intervalConfirmationRequired:
      "Changing the billing interval requires confirmation.",
    checkoutUnavailable:
      "Subscription billing is not configured yet. Please check the Stripe prices.",
    checkoutUrlFailed: "Failed to get the Checkout URL.",
    checkoutPrepareFailed: "Failed to prepare the subscription checkout.",
    previewPrepareFailed: "Failed to prepare the change preview.",
    changePrepareFailed: "Failed to change the subscription.",
    changePaymentFailed:
      "The payment did not complete, so the subscription was not changed.",
    scheduledChangeNotFound: "No scheduled plan change was found to cancel.",
    scheduledChangeCancelFailed: "Failed to cancel the scheduled plan change.",
    pendingCancellationNotFound: "No pending cancellation was found.",
    resumeCancellationFailed: "Failed to resume the subscription.",
    portalUnavailable: "No subscription record was found.",
    portalSessionFailed: "Failed to prepare the customer portal.",
    customerNotFound: "Stripe customer was not found.",
  },
};

export function getSubscriptionRouteCopy(locale: Locale): SubscriptionRouteCopy {
  return COPY[locale];
}
