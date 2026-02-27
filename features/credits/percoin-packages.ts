export type PercoinPackage = {
  id: string;
  name: string;
  credits: number;
  priceYen: number;
  stripePriceId?: string;
  description?: string;
};

/**
 * ペルコインパッケージ（Stripe Pricing Table / stripe-price-mapping.ts と一致させる）
 * 料金ページ・モック購入・PercoinPurchaseSection で使用
 */
export const PERCOIN_PACKAGES: PercoinPackage[] = [
  {
    id: "credit-100",
    name: "100ペルコイン",
    credits: 100,
    priceYen: 500,
    stripePriceId: "price_1So3VWEtgRYjQynQFp1IBmUG", // テスト / price_1So0f9ImYtwDZrxbiT1nLlS7 本番
    description: "お試しに最適な基本パッケージ",
  },
  {
    id: "credit-220",
    name: "220ペルコイン",
    credits: 220,
    priceYen: 1000,
    stripePriceId: "price_1So3W8EtgRYjQynQKACSaUuf", // テスト / price_1So0o1ImYtwDZrxbw9P7P2cG 本番
    description: "スタンダードパック",
  },
  {
    id: "credit-760",
    name: "760ペルコイン",
    credits: 760,
    priceYen: 3000,
    stripePriceId: "price_1So3WaEtgRYjQynQmDFItWJG", // テスト / price_1So0pGImYtwDZrxbDTih5U7n 本番
    description: "まとめ買いでお得",
  },
  {
    id: "credit-1600",
    name: "1,600ペルコイン",
    credits: 1600,
    priceYen: 5000,
    stripePriceId: "price_1So3X8EtgRYjQynQ6FbbGnkD", // テスト / price_1So0rMImYtwDZrxb22AS2zY6 本番
    description: "人気の大容量パック",
  },
  {
    id: "credit-4700",
    name: "4,700ペルコイン",
    credits: 4700,
    priceYen: 10000,
    stripePriceId: "price_1SoAzfEtgRYjQynQ8ZA8EgvZ", // テスト / price_1So11aImYtwDZrxbYeCcIt2b 本番
    description: "ヘビーユーザー向け最大パック",
  },
];

export function findPercoinPackage(packageId: string): PercoinPackage | undefined {
  return PERCOIN_PACKAGES.find((pkg) => pkg.id === packageId);
}

/** 標準モデル（gemini-2.5-flash-image）の1枚あたり消費量。料金ページの目安表示に使用 */
export const GENERATION_PERCOIN_COST = 20;
