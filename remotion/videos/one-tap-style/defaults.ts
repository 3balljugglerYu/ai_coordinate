import type {OneTapStylePromoProps} from "./types";

const sharedAssets = {
  appIconSrc: "icons/icon-512.png",
  mainImageSrc: "remotion/one-tap-style/main_image.png",
  resultImageSrc: "remotion/one-tap-style/result.JPG",
  characterImageSrc: "remotion/one-tap-style/my_character.WEBP",
  selectedStyleId: "gothic_witch",
  styleOptions: [
    {
      id: "fluffy_pajamas_code",
      name: "FLUFFY PAJAMAS CODE",
      imageSrc: "style/fluffy_pajamas_code/fluffy_pajamas_code.webp",
      accent: "#ff90c2",
    },
    {
      id: "gothic_witch",
      name: "GOTHIC WITCH",
      imageSrc: "style/gothic_witch/gothic_witch.webp",
      accent: "#a48cff",
    },
    {
      id: "kimono",
      name: "KIMONO",
      imageSrc: "style/kimono/kimono.webp",
      accent: "#72d5bb",
    },
    {
      id: "paris_code",
      name: "PARIS CODE",
      imageSrc: "style/paris_code/paris_code.webp",
      accent: "#6eb2ff",
    },
    {
      id: "spring_smart_casual",
      name: "SPRING SMART CASUAL",
      imageSrc: "style/spring_smart_casual/spring_smart_casual.webp",
      accent: "#ffb45c",
    },
  ],
} as const;

const sharedCopy = {
  cinematicTitle1: "配信者へ",
  cinematicTitle2: "マイキャラの衣装変更を楽に",
  heroLabel: "Persta.AI / One-Tap Style",
  valueBadge: "プロンプト入力ゼロ",
  pageTitle: "One-Tap Style",
  pageDescription: "好きなスタイルを選ぶだけで、すぐ着せ替え。",
  sectionStyleTitle: "スタイル選択",
  sectionStyleDescription: "着せ替えたいスタイルを選択してください。",
  sectionCharacterTitle: "マイキャラ選択",
  sectionCharacterDescription:
    "着せ替えたいキャラクターをアップロードしてください。",
  sourceLabel: "My Character",
  styleLabel: "Style",
  sourceTypeLabel: "アップロード画像のタイプ",
  sourceTypePrimary: "イラスト",
  sourceTypeSecondary: "リアル",
  modelLabel: "生成モデル",
  modelValue: "Nano Banana 2 / 0.5K",
  actionLabel: "Start Styling",
  generateHint: "スタイルを選んで、生成するだけ。",
  progressTitle: "スタイリング中です",
  progressMessages: [
    "選んだスタイルを合わせています...",
    "キャラにぴったりのバランスを整えています...",
    "仕上がりを確認しています...",
    "もうすぐ完成です...",
  ],
  progressHint: "待ち時間は短め。すぐに完成イメージを見せます。",
  heroCardLabel: "ワンタップ着せ替え",
  resultCardLabel: "着せ替え結果",
  beforeLabel: "Before",
  afterLabel: "After",
  stepStyle: "① スタイルを選ぶ",
  stepStyleBody: "横スクロールから、好きなスタイルをひとつ選択。",
  stepCharacter: "② 自分のキャラを選ぶ",
  stepCharacterBody: "キャラ画像をセットするだけで、すぐ準備完了。",
  stepGenerate: "③ 生成するだけ",
  stepGenerateBody: "生成ボタンを押せば、短い待ち時間で結果へ。",
  revealLabel: "着せ替え、完成",
  endingHeadline: "誰でも、かんたん着せ替え。",
  endingBody: "あなたのキャラが、すぐ着替える。",
  brandCaption: "ワンタップスタイル",
} as const;

const createDefaults = ({
  variant,
  heroHeadline,
  heroBody,
}: {
  variant: OneTapStylePromoProps["variant"];
  heroHeadline: string;
  heroBody: string;
}) => {
  return {
    variant,
    copy: {
      ...sharedCopy,
      heroHeadline,
      heroBody,
    },
    assets: sharedAssets,
  } satisfies OneTapStylePromoProps;
};

export const oneTapStylePromoDefaultsZeroPrompt = createDefaults({
  variant: "zero-prompt",
  heroHeadline: "プロンプト入力ゼロ。",
  heroBody: "スタイルを選ぶだけで、着せ替え完成。",
});

export const oneTapStylePromoDefaultsOneTap = createDefaults({
  variant: "one-tap",
  heroHeadline: "ワンタップで着せ替え。",
  heroBody: "難しい設定なしで、すぐかわいく着せ替え。",
});

export const oneTapStylePromoDefaultsChooseOnly = createDefaults({
  variant: "choose-only",
  heroHeadline: "選ぶだけで、着せ替え完成。",
  heroBody: "自分のキャラに、好きなスタイルをサッと適用。",
});

export const oneTapStylePromoDefaults = oneTapStylePromoDefaultsZeroPrompt;
