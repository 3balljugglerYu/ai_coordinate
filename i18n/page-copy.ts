import type {Locale} from "@/i18n/config";

const siteCopy = {
  ja: {
    title:
      "Persta.AI (ペルスタ) - 着てみたいも、なりたいも。AIスタイリングプラットフォーム",
    description:
      "Persta（ペルスタ）は、AIでファッション・キャラクターなどのビジュアル表現を自由にスタイリングできるプラットフォームです。persta.aiで、みんなの作品を見て、インスピレーションを得ましょう。",
  },
  en: {
    title:
      "Persta.AI - An AI styling platform for fashion, characters, and visual expression",
    description:
      "Persta is an AI styling platform where you can explore fashion, character, and visual expression ideas, then discover inspiration from the community on persta.ai.",
  },
} as const satisfies Record<Locale, {title: string; description: string}>;

const homeCopy = {
  ja: {
    metadataTitle: "Persta.AI (ペルスタ)",
    metadataDescription: "着てみたいも、なりたいも。AIスタイリングプラットフォーム",
    heading: "Persta | ペルスタ",
    subtitle: "着てみたいも、なりたいも。AIスタイリングプラットフォーム",
    organizationDescription:
      "Persta（ペルスタ）は、AIでファッション・キャラクターなどのビジュアル表現を自由にスタイリングできるプラットフォームです。",
  },
  en: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "An AI styling platform for the looks and characters you want to create.",
    heading: "Persta",
    subtitle:
      "An AI styling platform for the looks and characters you want to create.",
    organizationDescription:
      "Persta is an AI styling platform for freely styling fashion, characters, and other visual ideas.",
  },
} as const satisfies Record<
  Locale,
  {
    metadataTitle: string;
    metadataDescription: string;
    heading: string;
    subtitle: string;
    organizationDescription: string;
  }
>;

const freeMaterialsCopy = {
  ja: {
    title: "着せ替えお試し用素材 | Persta.AI",
    description:
      "こちらに掲載しているイラストは、Perstaで着せ替えを試すために、自由にダウンロードして利用できる素材ページです。お好きな画像をダウンロードして、ぜひ着せ替えをお試しください！",
    ogTitle: "着せ替えお試し用素材",
    ogDescription:
      "Perstaで着せ替えを試すためのフリー素材。イラストをダウンロードして着せ替えをお試しください。",
    heading: "着せ替えフリー素材",
    body:
      "Perstaで着せ替えを試せるイラスト素材です。画像はダウンロードしてご利用ください。",
    mobileHint: "※モバイル端末では画像を長押しすると保存できます。",
  },
  en: {
    title: "Free Outfit Test Assets | Persta.AI",
    description:
      "Download free illustration assets from this page and try outfit swaps in Persta with your favorite image.",
    ogTitle: "Free Outfit Test Assets",
    ogDescription:
      "Free illustration assets for trying outfit swaps in Persta. Download an image and start experimenting.",
    heading: "Free outfit test assets",
    body:
      "These illustrations are free assets for trying outfit swaps in Persta. Download any image and use it freely.",
    mobileHint: "On mobile devices, press and hold an image to save it.",
  },
} as const satisfies Record<
  Locale,
  {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
    heading: string;
    body: string;
    mobileHint: string;
  }
>;

const searchCopy = {
  ja: {
    defaultTitle: "検索 - Persta.AI",
    defaultDescription:
      "プロンプトを検索して、好きなファッションやキャラクターを見つけましょう",
    resultTitle: "{query}の検索結果 - Persta.AI",
    resultDescription:
      "「{query}」のコーデ・ファッション・キャラクター画像を検索。Persta.AIでみんなの作品を見つけましょう。",
    emptyQuery: "検索キーワードを入力してください",
  },
  en: {
    defaultTitle: "Search - Persta.AI",
    defaultDescription:
      "Search prompts to discover fashion looks and characters you like.",
    resultTitle: "Results for {query} - Persta.AI",
    resultDescription:
      "Search Persta.AI for fashion, styling, and character images related to “{query}”.",
    emptyQuery: "Enter a keyword to start searching.",
  },
} as const satisfies Record<
  Locale,
  {
    defaultTitle: string;
    defaultDescription: string;
    resultTitle: string;
    resultDescription: string;
    emptyQuery: string;
  }
>;

const postPageCopy = {
  ja: {
    fallbackDescription: "Persta.AIで作成したコーデ画像です。",
    fallbackAlt: "Persta.AI 投稿画像",
    notFoundTitle: "投稿が見つかりません | Persta.AI",
    notFoundDescription: "指定された投稿は見つかりませんでした。",
  },
  en: {
    fallbackDescription: "A styling image created on Persta.AI.",
    fallbackAlt: "Persta.AI post image",
    notFoundTitle: "Post not found | Persta.AI",
    notFoundDescription: "The requested post could not be found.",
  },
} as const satisfies Record<
  Locale,
  {
    fallbackDescription: string;
    fallbackAlt: string;
    notFoundTitle: string;
    notFoundDescription: string;
  }
>;

export function getSiteCopy(locale: Locale) {
  return siteCopy[locale];
}

export function getHomeCopy(locale: Locale) {
  return homeCopy[locale];
}

export function getFreeMaterialsCopy(locale: Locale) {
  return freeMaterialsCopy[locale];
}

export function getSearchCopy(locale: Locale) {
  return searchCopy[locale];
}

export function getPostPageCopy(locale: Locale) {
  return postPageCopy[locale];
}
