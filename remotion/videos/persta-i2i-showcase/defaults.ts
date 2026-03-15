import type {PerstaIntroVideoProps} from "./types";

export const perstaI2IShowcaseDefaults = {
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
  mainImageSrc: "remotion/persta-i2i-showcase/i2i_main.png",
  baseImageSrc: "remotion/persta-i2i-showcase/i2i_base.png",
  characterImageSrc: "remotion/persta-i2i-showcase/i2i_my_character.png",
  resultImageSrc: "remotion/persta-i2i-showcase/i2i_result.png",
} satisfies PerstaIntroVideoProps;
