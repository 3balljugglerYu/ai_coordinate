import type { Locale } from "@/i18n/config";

export const sourceImageRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    fileRequired: "ファイルが選択されていません",
    unsupportedFormat: (formats: string) =>
      `許可されていないファイル形式です。対応形式: ${formats}`,
    fileTooLarge: "ファイルサイズは10MB以下にしてください",
    uploadFailed: "画像のアップロードに失敗しました",
    saveFailed: "ストック画像の保存に失敗しました",
    stockLimitReached: "ストック画像の上限に達しました",
    stockIdRequired: "ストック画像IDが必要です",
    stockNotFound: "ストック画像が見つかりません",
    deleteForbidden: "このストック画像を削除する権限がありません",
    serverConfigError: "サーバー設定エラーにより画像を削除できませんでした。",
    storageDeleteFailed: "ストレージからの画像削除に失敗しました。",
    deleteFailed: "ストック画像の削除に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    fileRequired: "Select a file before uploading.",
    unsupportedFormat: (formats: string) =>
      `This file format is not supported. Supported formats: ${formats}`,
    fileTooLarge: "File size must be 10MB or smaller.",
    uploadFailed: "Failed to upload the image.",
    saveFailed: "Failed to save the stock image.",
    stockLimitReached: "You have reached the stock image limit.",
    stockIdRequired: "A stock image ID is required.",
    stockNotFound: "The stock image could not be found.",
    deleteForbidden: "You do not have permission to delete this stock image.",
    serverConfigError:
      "The image could not be deleted because of a server configuration error.",
    storageDeleteFailed: "Failed to delete the image from storage.",
    deleteFailed: "Failed to delete the stock image.",
  },
} as const satisfies Record<
  Locale,
  {
    authRequired: string;
    fileRequired: string;
    unsupportedFormat: (formats: string) => string;
    fileTooLarge: string;
    uploadFailed: string;
    saveFailed: string;
    stockLimitReached: string;
    stockIdRequired: string;
    stockNotFound: string;
    deleteForbidden: string;
    serverConfigError: string;
    storageDeleteFailed: string;
    deleteFailed: string;
  }
>;

export function getSourceImageRouteCopy(locale: Locale) {
  return sourceImageRouteCopy[locale];
}
