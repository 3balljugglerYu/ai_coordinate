import type { Locale } from "@/i18n/config";

export const inspireRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    submitterNotAllowed:
      "現在この機能は限定公開中です。利用許可されたユーザーのみご利用いただけます。",
    invalidRequest: "不正なリクエストです",
    consentRequired: "著作権同意が必要です",
    rateLimitDaily:
      "プレビュー生成は 24 時間で 10 回までです。明日また試してください。",
    capExceeded:
      "申請可能なテンプレート数の上限（5 件）に達しています。既存の申請を取り下げてから再試行してください。",
    templateNotFound: "テンプレートが見つかりません",
    templateNotVisible: "テンプレートが公開されていません",
    templateGenerationFailed:
      "プレビュー生成に失敗しました。しばらくしてから、もう一度お試しください。",
    templatePartialPreview:
      "片方のプレビュー生成のみ成功しました。問題なければそのまま申請できます。",
    safetyBlocked:
      "安全性ポリシーによりプレビューを生成できませんでした。別の画像でお試しください。",
    sourceImageMissing: "テンプレート画像をアップロードしてください",
    sourceImageTooLarge:
      "画像サイズが大きすぎます。10MB 以下の画像に圧縮して再試行してください。",
    sourceImageInvalidFormat:
      "対応していない画像形式です。PNG / JPEG / WebP / HEIC をご利用ください。",
    promotionFailed: "申請の登録に失敗しました",
    promotionMissingImage:
      "テンプレート画像のアップロードが完了していません",
    withdrawFailed: "申請の取り下げに失敗しました",
    withdrawNotOwner: "他のユーザーの申請は取り下げできません",
    decisionInvalidAction: "操作種別が不正です",
    decisionFailed: "審査判定の反映に失敗しました",
    decisionUnauthorized: "管理者権限が必要です",
    orderUpdateFailed: "並び順の更新に失敗しました",
    listFetchFailed: "テンプレート一覧の取得に失敗しました",
    notConfigured: "Inspire 機能が有効化されていません",
    testCharacterMissing:
      "INSPIRE_TEST_CHARACTER_IMAGE_URL が設定されていないためプレビュー生成を実行できません",
  },
  en: {
    authRequired: "You need to be logged in.",
    submitterNotAllowed:
      "This feature is currently in limited release. Only allow-listed users can submit templates.",
    invalidRequest: "The request is invalid.",
    consentRequired: "Copyright consent is required.",
    rateLimitDaily:
      "Preview generation is limited to 10 attempts per 24 hours. Please try again tomorrow.",
    capExceeded:
      "You have reached the limit of 5 active template submissions. Withdraw an existing one to submit a new template.",
    templateNotFound: "Template not found.",
    templateNotVisible: "Template is not currently visible.",
    templateGenerationFailed:
      "Preview generation failed. Please try again later.",
    templatePartialPreview:
      "Only one of the two preview models succeeded. You can still submit if you are okay with the result.",
    safetyBlocked:
      "Preview blocked by safety policy. Please try a different image.",
    sourceImageMissing: "Please upload a template image.",
    sourceImageTooLarge:
      "The image is too large. Compress it to 10MB or smaller and try again.",
    sourceImageInvalidFormat:
      "Unsupported image format. Please use PNG / JPEG / WebP / HEIC.",
    promotionFailed: "Failed to submit the template.",
    promotionMissingImage:
      "Template image upload has not completed.",
    withdrawFailed: "Failed to withdraw the submission.",
    withdrawNotOwner: "You cannot withdraw another user's submission.",
    decisionInvalidAction: "Invalid action.",
    decisionFailed: "Failed to apply the moderation decision.",
    decisionUnauthorized: "Admin permission required.",
    orderUpdateFailed: "Failed to update display order.",
    listFetchFailed: "Failed to load templates.",
    notConfigured: "Inspire feature is not enabled.",
    testCharacterMissing:
      "INSPIRE_TEST_CHARACTER_IMAGE_URL is not configured. Preview generation is unavailable.",
  },
} as const;

export type InspireRouteCopy = (typeof inspireRouteCopy)["ja"];

export function getInspireRouteCopy(locale: Locale): InspireRouteCopy {
  // Locale により解決される copy は同じ shape を持つが、リテラル型推論で readonly な
  // 異なる union になるため as でキャストする（ja/en のキー集合は同期している）
  return (inspireRouteCopy[locale] ?? inspireRouteCopy.ja) as InspireRouteCopy;
}
