import type { Locale } from "@/i18n/config";

/**
 * 絵師カタログ機能の API ハンドラ用 i18n メッセージ。
 * MVP は ja のみ実値、他言語ファイルにはフォールバックとして ja の文言をコピーしている。
 * 詳細は docs/planning/user-catalog-implementation-plan.md の ADR-006 参照。
 */
export const catalogRouteCopy = {
  ja: {
    invalidRequest: "不正なリクエストです",
    campaignNotFound: "企画が見つかりません",
    campaignNotPublished: "この企画はまだ公開されていません",
    listFetchFailed: "カタログの取得に失敗しました",
    entriesFetchFailed: "ページ一覧の取得に失敗しました",
    entryNotFound: "ページが見つかりません",
    submissionInvalid: "申請内容に不備があります",
    submissionImageMissing: "画像をアップロードしてください",
    submissionImageTooLarge:
      "画像サイズが大きすぎます。10MB 以下の画像に圧縮して再試行してください。",
    submissionImageInvalidFormat:
      "対応していない画像形式です。PNG / JPEG / WebP をご利用ください。",
    submissionConsentRequired: "著作権同意が必要です",
    submissionXAccountInvalid: "X アカウント URL の形式が正しくありません",
    submissionTweetInvalid: "ツイート URL の形式が正しくありません",
    submissionTweetDuplicate: "同じツイートは既に申請・公開されています",
    submissionRateLimited:
      "短時間に複数回の申請が検出されました。時間をおいて再試行してください。",
    submissionCapExceeded:
      "この企画に申請できる枚数の上限 (3 枚) に達しています。",
    submissionTurnstileFailed:
      "セキュリティチェックに失敗しました。ページを更新して再度お試しください。",
    submissionFailed: "申請の登録に失敗しました",
    storageUploadFailed: "画像のアップロードに失敗しました",
    decisionInvalidAction: "操作種別が不正です",
    decisionFailed: "審査判定の反映に失敗しました",
    decisionUnauthorized: "管理者権限が必要です",
    authRequired: "認証が必要です",
  },
  en: {
    invalidRequest: "Invalid request.",
    campaignNotFound: "Campaign not found.",
    campaignNotPublished: "This campaign is not published yet.",
    listFetchFailed: "Failed to load the catalog.",
    entriesFetchFailed: "Failed to load the catalog pages.",
    entryNotFound: "Page not found.",
    submissionInvalid: "There are issues with your submission.",
    submissionImageMissing: "Please upload an image.",
    submissionImageTooLarge: "Image is too large. Please use a file smaller than 10MB.",
    submissionImageInvalidFormat:
      "Unsupported image format. Please use PNG, JPEG, or WebP.",
    submissionConsentRequired: "Copyright consent is required.",
    submissionXAccountInvalid: "The X account URL format is invalid.",
    submissionTweetInvalid: "The tweet URL format is invalid.",
    submissionTweetDuplicate: "The same tweet has already been submitted or approved.",
    submissionRateLimited:
      "Too many submissions detected in a short period. Please try again later.",
    submissionCapExceeded: "You have reached the limit of 3 entries per campaign.",
    submissionTurnstileFailed:
      "Security check failed. Please refresh the page and try again.",
    submissionFailed: "Failed to register your submission.",
    storageUploadFailed: "Failed to upload the image.",
    decisionInvalidAction: "Invalid action.",
    decisionFailed: "Failed to apply the moderation decision.",
    decisionUnauthorized: "Admin privileges are required.",
    authRequired: "Authentication required.",
  },
  ko: null,
  "zh-CN": null,
  "zh-TW": null,
  es: null,
  pt: null,
  fr: null,
  de: null,
  it: null,
  id: null,
  th: null,
  vi: null,
  hi: null,
  ar: null,
} as const satisfies Record<Locale, unknown>;

/**
 * locale 別の messages 取得。未訳の locale は ja にフォールバック (ADR-006)。
 */
export function getCatalogRouteCopy(locale: Locale): typeof catalogRouteCopy.ja {
  const value = catalogRouteCopy[locale];
  if (value == null) {
    return catalogRouteCopy.ja;
  }
  return value as typeof catalogRouteCopy.ja;
}
