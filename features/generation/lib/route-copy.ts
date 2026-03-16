import type { Locale } from "@/i18n/config";

export const generationRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    invalidRequest: "不正なリクエストです",
    sourceStockNotFound: "ストック画像が見つかりません",
    sourceStockFetchFailed: "ストック画像の取得に失敗しました",
    sourceImageTooLarge:
      "画像サイズが大きすぎます。10MB以下の画像に圧縮して再試行してください。",
    heicConversionFailed: "HEIC画像の変換に失敗しました",
    sourceUploadFailed: "元画像のアップロードに失敗しました。もう一度お試しください。",
    sourceProcessFailed: "元画像の処理中にエラーが発生しました。もう一度お試しください。",
    balanceFetchFailed: "ペルコイン残高の取得に失敗しました",
    insufficientBalance: (cost: number, balance: number) =>
      `ペルコイン残高が不足しています。生成には${cost}ペルコイン必要ですが、現在の残高は${balance}ペルコインです。`,
    jobCreateFailed: "ジョブの作成に失敗しました",
    queueDelayedWarning:
      "ジョブは作成されましたが、処理の開始が遅延する可能性があります。数秒後に再確認してください。",
    generateAsyncFailed: "画像生成ジョブの作成に失敗しました",
    jobIdRequired: "Job ID が必要です",
    jobNotFound: "ジョブが見つかりません",
    statusFetchFailed: "ステータスの取得に失敗しました",
    inProgressFetchFailed: "未完了ジョブの取得に失敗しました",
    noImagesGenerated: "画像を生成できませんでした。",
    safetyBlocked:
      "安全性ポリシーにより生成できませんでした。\n内容を変更して再試行してください。",
    genericGenerationFailed:
      "画像生成に失敗しました。しばらくしてから、もう一度お試しください。",
    webpMissingParams: "imageUrl, imageId, storagePath が必要です",
    webpFailed: "WebP生成に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    invalidRequest: "The request is invalid.",
    sourceStockNotFound: "The stock image could not be found.",
    sourceStockFetchFailed: "Failed to load the stock image.",
    sourceImageTooLarge: "The image is too large. Compress it to 10MB or smaller and try again.",
    heicConversionFailed: "Failed to convert the HEIC image.",
    sourceUploadFailed: "Failed to upload the source image. Please try again.",
    sourceProcessFailed: "Something went wrong while processing the source image. Please try again.",
    balanceFetchFailed: "Failed to load the Percoin balance.",
    insufficientBalance: (cost: number, balance: number) =>
      `You need ${cost} Percoins to generate this image, but your current balance is ${balance}.`,
    jobCreateFailed: "Failed to create the generation job.",
    queueDelayedWarning:
      "The job was created, but processing may start with a delay. Please check again in a few seconds.",
    generateAsyncFailed: "Failed to create the image generation job.",
    jobIdRequired: "A Job ID is required.",
    jobNotFound: "The job could not be found.",
    statusFetchFailed: "Failed to load the generation status.",
    inProgressFetchFailed: "Failed to load in-progress jobs.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
  },
} as const satisfies Record<
  Locale,
  {
    authRequired: string;
    invalidRequest: string;
    sourceStockNotFound: string;
    sourceStockFetchFailed: string;
    sourceImageTooLarge: string;
    heicConversionFailed: string;
    sourceUploadFailed: string;
    sourceProcessFailed: string;
    balanceFetchFailed: string;
    insufficientBalance: (cost: number, balance: number) => string;
    jobCreateFailed: string;
    queueDelayedWarning: string;
    generateAsyncFailed: string;
    jobIdRequired: string;
    jobNotFound: string;
    statusFetchFailed: string;
    inProgressFetchFailed: string;
    noImagesGenerated: string;
    safetyBlocked: string;
    genericGenerationFailed: string;
    webpMissingParams: string;
    webpFailed: string;
  }
>;

export function getGenerationRouteCopy(locale: Locale) {
  return generationRouteCopy[locale];
}
