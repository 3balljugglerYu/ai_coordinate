export type PerstaIntroVideoLocale = "ja" | "en";

export type PerstaIntroVideoLabels = {
  introBaseTag: string;
  introSwapTag: string;
  baseSceneEyebrow: string;
  baseSceneCardLabel: string;
  baseSceneCardCaption: string;
  baseSceneBackgroundTag: string;
  baseSceneOutfitTag: string;
  baseScenePoseTag: string;
  swapSceneEyebrow: string;
  swapSceneBaseLabel: string;
  swapSceneBaseCaption: string;
  swapSceneCharacterLabel: string;
  swapSceneCharacterCaption: string;
  swapSceneResultLabel: string;
  swapSceneResultCaption: string;
  resultSceneEyebrow: string;
  resultSceneResultLabel: string;
  resultSceneResultCaption: string;
  resultSceneBaseLabel: string;
  resultSceneCharacterLabel: string;
  ctaScenePreviewLabel: string;
};

export type PerstaIntroVideoProps = {
  locale: PerstaIntroVideoLocale;
  featureBadge: string;
  title: string;
  introHeadline: string;
  introBody: string;
  baseSceneMessage: string;
  baseSceneBody: string;
  swapSceneMessage: string;
  lockedMessage: string;
  resultSceneMessage: string;
  resultSceneBody: string;
  betaBadge: string;
  ctaTitle: string;
  ctaBody: string;
  ctaButtonLabel: string;
  labels: PerstaIntroVideoLabels;
  mainImageSrc: string;
  baseImageSrc: string;
  characterImageSrc: string;
  resultImageSrc: string;
};
