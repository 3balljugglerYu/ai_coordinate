import type { Locale } from "@/i18n/config";

export const contactRouteCopy = {
  ja: {
    authRequired: "ログインが必要です",
    invalidEmail: "有効なメールアドレスを入力してください",
    invalidSubject: "件名を入力してください",
    invalidMessage: "お問い合わせ内容を入力してください",
    invalidInput: "入力内容に誤りがあります",
    emailNotConfigured: "メール送信の設定が完了していません",
    sendFailed:
      "メールの送信に失敗しました。しばらく経ってからお試しください。",
    unknownError:
      "エラーが発生しました。しばらく経ってからお試しください。",
  },
  en: {
    authRequired: "You need to be logged in.",
    invalidEmail: "Enter a valid email address.",
    invalidSubject: "Enter a subject.",
    invalidMessage: "Enter your message.",
    invalidInput: "Please review the form fields.",
    emailNotConfigured: "Email delivery is not configured yet.",
    sendFailed:
      "Failed to send the email. Please try again in a little while.",
    unknownError:
      "Something went wrong. Please try again in a little while.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getContactRouteCopy(locale: Locale) {
  return contactRouteCopy[locale];
}
