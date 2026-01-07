export type PercoinPackage = {
  id: string;
  name: string;
  credits: number;
  priceYen: number;
  stripePriceId?: string;
  description?: string;
};

export const PERCOIN_PACKAGES: PercoinPackage[] = [
  {
    id: "credit-100",
    name: "100ペルコイン",
    credits: 100,
    priceYen: 500,
    description: "お試しに最適な基本パッケージ（100ペルコイン）",
  },
  {
    id: "credit-200",
    name: "200ペルコイン",
    credits: 200,
    priceYen: 950,
    description: "少しお得なスタンダードパック（200ペルコイン）",
  },
  {
    id: "credit-500",
    name: "500ペルコイン",
    credits: 500,
    priceYen: 2250,
    description: "まとめ買いでさらにお得（500ペルコイン）",
  },
  {
    id: "credit-1000",
    name: "1000ペルコイン",
    credits: 1000,
    priceYen: 4200,
    description: "ヘビーユーザー向け大容量パック（1000ペルコイン）",
  },
];

export function findPercoinPackage(packageId: string): PercoinPackage | undefined {
  return PERCOIN_PACKAGES.find((pkg) => pkg.id === packageId);
}

export const GENERATION_PERCOIN_COST = 10;
