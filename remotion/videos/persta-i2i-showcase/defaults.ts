import type {PerstaIntroVideoProps} from "./types";

const sharedAssets = {
  mainImageSrc: "remotion/persta-i2i-showcase/i2i_main.png",
  baseImageSrc: "remotion/persta-i2i-showcase/i2i_base.png",
  characterImageSrc: "remotion/persta-i2i-showcase/i2i_my_character.png",
  resultImageSrc: "remotion/persta-i2i-showcase/i2i_result.png",
} as const;

export const perstaI2IShowcaseDefaultsJa = {
  locale: "ja",
  featureBadge: "NEW BETA FEATURE",
  title: "AI Fashion Show",
  introHeadline: "背景・服装・ポーズはそのままに、別キャラクターへ。",
  introBody:
    "先行β版で、1枚のシーンをベースにキャラクターだけを差し替える新しい遊び方を公開。",
  baseSceneMessage: "1枚目のシーンをベースに",
  baseSceneBody: "背景・服装・ポーズを固定して、ショーの土台をそのまま使います。",
  swapSceneMessage: "あなたのキャラクターに、差し替え",
  lockedMessage: "背景・服装・ポーズは維持",
  resultSceneMessage:
    "あなたのキャラクターでファッションショーのように遊べる",
  resultSceneBody:
    "世界観はキープしたまま、好きなキャラクターをランウェイに立たせるように着せ替えを楽しめます。",
  betaBadge: "beta early access",
  ctaTitle: "先行β版を試す",
  ctaBody:
    "Persta.AIで、新しいキャラクター差し替え体験をいち早くチェック。",
  ctaButtonLabel: "Persta.AI 先行利用受付中",
  labels: {
    introBaseTag: "1枚目をベースに",
    introSwapTag: "2枚目のキャラへ差し替え",
    baseSceneEyebrow: "Scene 1 / Base",
    baseSceneCardLabel: "Base image",
    baseSceneCardCaption: "背景・服装・ポーズを固定して開始",
    baseSceneBackgroundTag: "Background locked",
    baseSceneOutfitTag: "Outfit locked",
    baseScenePoseTag: "Pose locked",
    swapSceneEyebrow: "Scene 2 / Swap",
    swapSceneBaseLabel: "Base scene",
    swapSceneBaseCaption: "背景・服装・ポーズはこのまま",
    swapSceneCharacterLabel: "My character",
    swapSceneCharacterCaption: "差し替え元のキャラクター",
    swapSceneResultLabel: "Generated result",
    swapSceneResultCaption: "生成結果",
    resultSceneEyebrow: "AI fashion show",
    resultSceneResultLabel: "Result",
    resultSceneResultCaption: "完成結果を大きく表示",
    resultSceneBaseLabel: "Base",
    resultSceneCharacterLabel: "My character",
    ctaScenePreviewLabel: "Preview",
  },
  ...sharedAssets,
} satisfies PerstaIntroVideoProps;

export const perstaI2IShowcaseDefaultsEn = {
  locale: "en",
  featureBadge: "NEW BETA FEATURE",
  title: "AI Fashion Show",
  introHeadline: "Keep the background, outfit, and pose, and swap in another character.",
  introBody:
    "The beta preview introduces a new way to play: keep one scene intact and replace only the character.",
  baseSceneMessage: "Start from the first scene",
  baseSceneBody:
    "Keep the background, outfit, and pose fixed so the runway setup stays exactly as it is.",
  swapSceneMessage: "Swap in your character",
  lockedMessage: "Keep the background, outfit, and pose intact",
  resultSceneMessage:
    "Play with a fashion-show scene using your own character",
  resultSceneBody:
    "Keep the world intact and enjoy styling as if your favorite character stepped onto the runway.",
  betaBadge: "beta early access",
  ctaTitle: "Try the beta preview",
  ctaBody:
    "Get an early look at the new character swap experience on Persta.AI.",
  ctaButtonLabel: "Persta.AI beta access open",
  labels: {
    introBaseTag: "Start from image one",
    introSwapTag: "Swap in character two",
    baseSceneEyebrow: "Scene 1 / Base",
    baseSceneCardLabel: "Base image",
    baseSceneCardCaption: "Start with the background, outfit, and pose locked",
    baseSceneBackgroundTag: "Background locked",
    baseSceneOutfitTag: "Outfit locked",
    baseScenePoseTag: "Pose locked",
    swapSceneEyebrow: "Scene 2 / Swap",
    swapSceneBaseLabel: "Base scene",
    swapSceneBaseCaption: "Keep the background, outfit, and pose",
    swapSceneCharacterLabel: "My character",
    swapSceneCharacterCaption: "Character to swap in",
    swapSceneResultLabel: "Generated result",
    swapSceneResultCaption: "Generated output",
    resultSceneEyebrow: "AI fashion show",
    resultSceneResultLabel: "Result",
    resultSceneResultCaption: "Show the final result large",
    resultSceneBaseLabel: "Base",
    resultSceneCharacterLabel: "My character",
    ctaScenePreviewLabel: "Preview",
  },
  ...sharedAssets,
} satisfies PerstaIntroVideoProps;

export const perstaI2IShowcaseDefaults = perstaI2IShowcaseDefaultsJa;
