import { isStripeTestMode } from "@/lib/env";

export type PercoinPackage = {
  id: string;
  name: string;
  credits: number;
  priceYen: number;
  /** テスト環境のStripe Price ID */
  stripePriceIdTest: string;
  /** 本番環境のStripe Price ID */
  stripePriceIdLive: string;
  description?: string;
  /** アプリ内カード表示用画像（/percoin.png など、public からの相対パス） */
  imageUrl?: string;
  /** カード左上に表示するラベル（例: 一番人気、おすすめ） */
  badgeLabel?: string;
};

/** バッジラベル「もっともお得！」（スタイル分岐に使用） */
export const BADGE_LABEL_MOST_VALUABLE = "もっともお得！" as const;

/** 現在の環境に応じたStripe Price IDを取得（Checkout Session作成用） */
export function getStripePriceId(pkg: PercoinPackage): string {
  return isStripeTestMode() ? pkg.stripePriceIdTest : pkg.stripePriceIdLive;
}

/**
 * Stripe Checkout用の画像URLを取得（絶対URLが必要、Stripeサーバーからアクセス可能であること）
 * localhost のURLはStripeが取得できないため空配列を返す
 * @param imageUrl パッケージのimageUrl（/percoin.png など）
 * @param baseUrl サイトのベースURL（NEXT_PUBLIC_SITE_URL）
 */
export function getStripeImageUrls(
  imageUrl: string | undefined,
  baseUrl: string
): string[] {
  if (!imageUrl) return [];
  const absolute =
    imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
      ? imageUrl
      : `${baseUrl.replace(/\/$/, "")}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
  // localhost は Stripe サーバーから取得不可のため除外
  if (absolute.includes("localhost") || absolute.includes("127.0.0.1")) {
    return [];
  }
  return [absolute];
}

/**
 * ペルコインパッケージ（Stripe Pricing Table / stripe-price-mapping.ts と一致させる）
 * 料金ページ・モック購入・PercoinPurchaseSection で使用
 */
export const PERCOIN_PACKAGES: PercoinPackage[] = [
  {
    id: "credit-110",
    name: "110ペルコイン",
    credits: 110,
    priceYen: 500,
    stripePriceIdTest: "price_1So3VWEtgRYjQynQFp1IBmUG",
    stripePriceIdLive: "price_1So0f9ImYtwDZrxbiT1nLlS7",
    description: "お試しパック\nまず数枚だけ生成したい方へ\n\n生成枚数\n標準モデル：約5枚\n解像度1Kモデル：約2枚",
    imageUrl: "/percoin/percoin1.webp",
    badgeLabel: "まずはお試し！",
  },
  {
    id: "credit-240",
    name: "240ペルコイン",
    credits: 240,
    priceYen: 1000,
    stripePriceIdTest: "price_1So3W8EtgRYjQynQKACSaUuf",
    stripePriceIdLive: "price_1So0o1ImYtwDZrxbw9P7P2cG",
    description: "ライトパック\n気軽に遊びたい方へ\n\n生成枚数\n標準モデル：約12枚\n解像度1Kモデル：約4枚",
    imageUrl: "/percoin/percoin2.webp",
  },
  {
    id: "credit-960",
    name: "960ペルコイン",
    credits: 960,
    priceYen: 3000,
    stripePriceIdTest: "price_1So3WaEtgRYjQynQmDFItWJG",
    stripePriceIdLive: "price_1So0pGImYtwDZrxbDTih5U7n",
    description: "ベーシックパック\nしっかり試したい方へ\n\n生成枚数\n標準モデル：約48枚\n解像度1Kモデル：約19枚",
    imageUrl: "/percoin/percoin3.webp",
    badgeLabel: "一番人気",
  },
  {
    id: "credit-1900",
    name: "1,900ペルコイン",
    credits: 1900,
    priceYen: 5000,
    stripePriceIdTest: "price_1So3X8EtgRYjQynQ6FbbGnkD",
    stripePriceIdLive: "price_1So0rMImYtwDZrxb22AS2zY6",
    description: "お得パック\n迷ったらこれ・コスパ◎\n\n生成枚数\n標準モデル：約95枚\n解像度1Kモデル：約38枚",
    imageUrl: "/percoin/percoin4.webp",
  },
  {
    id: "credit-4800",
    name: "4,800ペルコイン",
    credits: 4800,
    priceYen: 10000,
    stripePriceIdTest: "price_1SoAzfEtgRYjQynQ8ZA8EgvZ",
    stripePriceIdLive: "price_1So11aImYtwDZrxbYeCcIt2b",
    description: "最大お得パック\n1コイン単価が最安\n\n生成枚数\n標準モデル：約240枚\n解像度1Kモデル：約96枚",
    imageUrl: "/percoin/percoin5.webp",
    badgeLabel: BADGE_LABEL_MOST_VALUABLE,
  },
];

export function findPercoinPackage(packageId: string): PercoinPackage | undefined {
  return PERCOIN_PACKAGES.find((pkg) => pkg.id === packageId);
}

/** 標準モデル（gemini-2.5-flash-image）の1枚あたり消費量。料金ページの目安表示に使用 */
export const GENERATION_PERCOIN_COST = 20;
