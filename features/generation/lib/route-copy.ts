import type { Locale } from "@/i18n/config";

export const generationRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "このプロンプトは現在ご利用できません",
    generationFailed: "生成の準備に失敗しました。もう一度お試しください。",
    invalidRequest: "不正なリクエストです",
    gachaTooManyCandidates: (max: number) => `ガチャの候補は${max}個までです。`,
    gachaTooManyBlocks: (max: number) => `ガチャ（{{GACHA}} 〜 {{/GACHA}} の囲み）は、今は1つのプロンプトに${max}つまでです（2つ以上は今後対応予定です）。`,
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
    historyFetchFailed: "画像履歴の取得に失敗しました",
    noImagesGenerated: "画像を生成できませんでした。",
    safetyBlocked:
      "安全性ポリシーにより生成できませんでした。\n内容を変更して再試行してください。",
    genericGenerationFailed:
      "画像生成に失敗しました。しばらくしてから、もう一度お試しください。",
    providerBusy: "現在混み合っています。しばらく経ってからお試しください。",
    modelTemporarilyUnavailable:
      "選択した生成モデルは現在ご利用いただけません。別のモデルを選択してください。",
    webpMissingParams: "imageUrl, imageId, storagePath が必要です",
    webpFailed: "WebP生成に失敗しました",
    // ゲスト sync 経路（/api/coordinate-generate-guest）用
    guestRouteAuthForbidden:
      "ログイン中のため、こちらのお試し経路は利用できません。コーディネート画面の通常の生成をご利用ください。",
    guestModelNotAllowed:
      "選択したモデルはお試しではご利用いただけません。",
    guestImageMissing: "画像をアップロードしてください。",
    guestPromptMissing: "コーディネート内容を入力してください。",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 では GIF 画像はご利用いただけません。PNG / JPEG / WebP の画像をアップロードしてください。",
    guestRateLimitDaily:
      "本日の無料お試し回数（1日1回）に達しました。新規登録すると引き続き利用できます。",
    guestIdentifierUnavailable:
      "クライアント識別子を取得できませんでした。Cookie を有効にして再試行してください。",
    guestUpstreamUnavailable:
      "画像生成サービスが一時的に利用できません。少し時間をおいて再試行してください。",
    guestSafetyBlocked:
      "安全性ポリシーにより画像を生成できませんでした。内容を変更して再試行してください。",
  },
  en: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "This prompt is currently unavailable",
    generationFailed: "Failed to prepare the generation. Please try again.",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `A gacha can have up to ${max} candidates.`,
    gachaTooManyBlocks: (max: number) => `For now, a prompt can have up to ${max} gacha (one {{GACHA}} … {{/GACHA}} block). Support for 2 or more is planned.`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  ko: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "이 프롬프트는 현재 사용할 수 없습니다",
    generationFailed: "생성 준비에 실패했습니다. 다시 시도해 주세요.",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `가챠 후보는 ${max}개까지입니다.`,
    gachaTooManyBlocks: (max: number) => `가챠({{GACHA}} ~ {{/GACHA}} 블록)는 지금은 프롬프트 하나에 ${max}개까지입니다(2개 이상은 앞으로 지원할 예정입니다).`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  "zh-CN": {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "该提示词当前不可用",
    generationFailed: "生成准备失败，请重试。",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `扭蛋候选最多 ${max} 个。`,
    gachaTooManyBlocks: (max: number) => `扭蛋（{{GACHA}} … {{/GACHA}} 区块）目前一个提示词最多 ${max} 个（2 个以上计划今后支持）。`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  "zh-TW": {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "此提示詞目前無法使用",
    generationFailed: "生成準備失敗，請重試。",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `轉蛋候選最多 ${max} 個。`,
    gachaTooManyBlocks: (max: number) => `轉蛋（{{GACHA}} … {{/GACHA}} 區塊）目前一個提示詞最多 ${max} 個（2 個以上預計今後支援）。`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  es: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "Este prompt no está disponible por ahora",
    generationFailed: "No se pudo preparar la generación. Inténtalo de nuevo.",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `Un gacha puede tener hasta ${max} candidatos.`,
    gachaTooManyBlocks: (max: number) => `Por ahora, un prompt puede tener como máximo ${max} gacha (un bloque {{GACHA}} … {{/GACHA}}). Está previsto admitir 2 o más.`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  pt: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "Este prompt não está disponível no momento",
    generationFailed: "Falha ao preparar a geração. Tente novamente.",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `Um gacha pode ter até ${max} candidatos.`,
    gachaTooManyBlocks: (max: number) => `Por enquanto, um prompt pode ter no máximo ${max} gacha (um bloco {{GACHA}} … {{/GACHA}}). O suporte a 2 ou mais está previsto.`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  fr: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "Ce prompt n'est pas disponible pour le moment",
    generationFailed: "Échec de la préparation de la génération. Veuillez réessayer.",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `Un gacha peut contenir jusqu’à ${max} candidats.`,
    gachaTooManyBlocks: (max: number) => `Pour l’instant, un prompt peut contenir au maximum ${max} gacha (un bloc {{GACHA}} … {{/GACHA}}). La prise en charge de 2 ou plus est prévue.`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  de: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "Dieser Prompt ist derzeit nicht verfügbar",
    generationFailed: "Die Generierung konnte nicht vorbereitet werden. Bitte erneut versuchen.",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `Ein Gacha kann bis zu ${max} Kandidaten enthalten.`,
    gachaTooManyBlocks: (max: number) => `Ein Prompt kann derzeit höchstens ${max} Gacha enthalten (ein {{GACHA}} … {{/GACHA}}-Block). Unterstützung für 2 oder mehr ist geplant.`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  it: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "Questo prompt non è attualmente disponibile",
    generationFailed: "Preparazione della generazione non riuscita. Riprova.",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `Un gacha può avere fino a ${max} candidati.`,
    gachaTooManyBlocks: (max: number) => `Per ora un prompt può avere al massimo ${max} gacha (un blocco {{GACHA}} … {{/GACHA}}). Il supporto a 2 o più è previsto.`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  id: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "Prompt ini sedang tidak tersedia",
    generationFailed: "Gagal menyiapkan pembuatan. Silakan coba lagi.",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `Gacha dapat berisi maksimal ${max} kandidat.`,
    gachaTooManyBlocks: (max: number) => `Untuk saat ini, satu prompt dapat berisi maksimal ${max} gacha (satu blok {{GACHA}} … {{/GACHA}}). Dukungan untuk 2 atau lebih direncanakan.`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  th: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "พรอมป์นี้ยังไม่พร้อมใช้งาน",
    generationFailed: "เตรียมการสร้างไม่สำเร็จ กรุณาลองอีกครั้ง",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `กาชามีตัวเลือกได้สูงสุด ${max} รายการ`,
    gachaTooManyBlocks: (max: number) => `กาชา (บล็อก {{GACHA}} … {{/GACHA}}) ตอนนี้ 1 พรอมต์มีได้สูงสุด ${max} อัน (มีแผนจะรองรับ 2 อันขึ้นไป)`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  vi: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "Prompt này hiện không khả dụng",
    generationFailed: "Không thể chuẩn bị tạo ảnh. Vui lòng thử lại.",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `Mỗi gacha có tối đa ${max} ứng viên.`,
    gachaTooManyBlocks: (max: number) => `Hiện tại, mỗi prompt có tối đa ${max} gacha (một khối {{GACHA}} … {{/GACHA}}). Dự kiến sẽ hỗ trợ từ 2 trở lên.`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  hi: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "यह प्रॉम्प्ट अभी उपलब्ध नहीं है",
    generationFailed: "जनरेशन तैयार करने में विफल। कृपया पुनः प्रयास करें।",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `एक गाचा में अधिकतम ${max} उम्मीदवार हो सकते हैं।`,
    gachaTooManyBlocks: (max: number) => `अभी एक प्रॉम्प्ट में ज़्यादा से ज़्यादा ${max} गाचा ({{GACHA}} … {{/GACHA}} ब्लॉक) हो सकता है। 2 या उससे ज़्यादा के समर्थन की योजना है।`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
  ar: {
    authRequired: "You need to be logged in.",
    // 派生生成の原作が利用できないとき。理由は出さない（ADR-005）。
    derivedSourceUnavailable: "هذا الموجّه غير متاح حاليًا",
    generationFailed: "فشل تحضير التوليد. حاول مرة أخرى.",
    invalidRequest: "The request is invalid.",
    gachaTooManyCandidates: (max: number) => `يمكن أن تحتوي الجاتشا على ${max} مرشحين كحد أقصى.`,
    gachaTooManyBlocks: (max: number) => `حاليًا، يمكن أن يحتوي الموجّه على ${max} جاتشا كحد أقصى (كتلة {{GACHA}} … {{/GACHA}} واحدة). دعم 2 أو أكثر مخطط له.`,
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
    historyFetchFailed: "Failed to load the image history.",
    noImagesGenerated: "No image could be generated.",
    safetyBlocked:
      "The request was blocked by the safety policy.\nPlease revise the content and try again.",
    genericGenerationFailed:
      "Image generation failed. Please try again in a little while.",
    providerBusy:
      "We're currently experiencing high demand. Please try again in a little while.",
    modelTemporarilyUnavailable:
      "The selected generation model is currently unavailable. Please choose another model.",
    webpMissingParams: "imageUrl, imageId, and storagePath are required.",
    webpFailed: "Failed to generate WebP assets.",
    // Guest sync route (/api/coordinate-generate-guest)
    guestRouteAuthForbidden:
      "You are signed in, so this guest preview endpoint is unavailable. Please use the regular generate flow on the coordinate page.",
    guestModelNotAllowed:
      "The selected model is not available in the guest preview.",
    guestImageMissing: "Please upload an image.",
    guestPromptMissing: "Please enter coordinate details.",
    guestGifNotSupportedByOpenAI:
      "ChatGPT Image 2.0 does not support GIF images. Please upload a PNG, JPEG, or WebP image instead.",
    guestRateLimitDaily:
      "You have reached today's free trial limit (1 per day). Sign up to continue using the service.",
    guestIdentifierUnavailable:
      "Could not identify your client. Please enable cookies and try again.",
    guestUpstreamUnavailable:
      "The image generation service is temporarily unavailable. Please try again in a few moments.",
    guestSafetyBlocked:
      "The request was blocked by the safety policy. Please revise the content and try again.",
  },
} as const satisfies Record<
  Locale,
  {
    authRequired: string;
    /** 派生生成の原作が利用できないとき。理由は出さない（ADR-005） */
    derivedSourceUnavailable: string;
    /** ガチャの囲みの候補が上限を超えたとき（画面では送れないが、直接送られたとき用） */
    gachaTooManyCandidates: (max: number) => string;
    /** ガチャの囲みの数が上限を超えたとき（運営は制限しない） */
    gachaTooManyBlocks: (max: number) => string;
    /** 派生生成の準備に失敗したとき（検証RPCが失敗など） */
    generationFailed: string;
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
    historyFetchFailed: string;
    noImagesGenerated: string;
    safetyBlocked: string;
    genericGenerationFailed: string;
    /** プロバイダ側の請求上限到達等、内部事情を出さず「混雑」として案内する文言 */
    providerBusy: string;
    modelTemporarilyUnavailable: string;
    webpMissingParams: string;
    webpFailed: string;
    guestRouteAuthForbidden: string;
    guestModelNotAllowed: string;
    guestImageMissing: string;
    guestPromptMissing: string;
    guestGifNotSupportedByOpenAI: string;
    guestRateLimitDaily: string;
    guestIdentifierUnavailable: string;
    guestUpstreamUnavailable: string;
    guestSafetyBlocked: string;
  }
>;

export function getGenerationRouteCopy(locale: Locale) {
  return generationRouteCopy[locale];
}
