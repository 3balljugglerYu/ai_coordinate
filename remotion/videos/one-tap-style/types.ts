export type OneTapStylePromoVariant =
  | "zero-prompt"
  | "one-tap"
  | "choose-only";

export type OneTapStylePromoStyleOption = {
  id: string;
  name: string;
  imageSrc: string;
  accent: string;
};

export type OneTapStylePromoResolvedStyleOption = Omit<
  OneTapStylePromoStyleOption,
  "imageSrc"
> & {
  imageUrl: string;
};

export type OneTapStylePromoAssets = {
  appIconSrc: string;
  mainImageSrc: string;
  resultImageSrc: string;
  characterImageSrc: string;
  styleOptions: readonly OneTapStylePromoStyleOption[];
  selectedStyleId: string;
};

export type OneTapStylePromoCopy = {
  cinematicTitle1: string;
  cinematicTitle2: string;
  heroLabel: string;
  heroHeadline: string;
  heroBody: string;
  valueBadge: string;
  pageTitle: string;
  pageDescription: string;
  sectionStyleTitle: string;
  sectionStyleDescription: string;
  sectionCharacterTitle: string;
  sectionCharacterDescription: string;
  sourceLabel: string;
  styleLabel: string;
  sourceTypeLabel: string;
  sourceTypePrimary: string;
  sourceTypeSecondary: string;
  modelLabel: string;
  modelValue: string;
  actionLabel: string;
  generateHint: string;
  progressTitle: string;
  progressMessages: readonly string[];
  progressHint: string;
  heroCardLabel: string;
  resultCardLabel: string;
  beforeLabel: string;
  afterLabel: string;
  stepStyle: string;
  stepStyleBody: string;
  stepCharacter: string;
  stepCharacterBody: string;
  stepGenerate: string;
  stepGenerateBody: string;
  revealLabel: string;
  endingHeadline: string;
  endingBody: string;
  brandCaption: string;
};

export type OneTapStylePromoProps = {
  variant: OneTapStylePromoVariant;
  copy: OneTapStylePromoCopy;
  assets: OneTapStylePromoAssets;
};
