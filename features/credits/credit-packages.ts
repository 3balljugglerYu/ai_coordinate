export type CreditPackage = {
  id: string;
  name: string;
  credits: number;
  priceYen: number;
  stripePriceId?: string;
  description?: string;
};

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: "credit-100",
    name: "100クレジット",
    credits: 100,
    priceYen: 500,
    description: "お試しに最適な基本パッケージ",
  },
  {
    id: "credit-200",
    name: "200クレジット",
    credits: 200,
    priceYen: 950,
    description: "少しお得なスタンダードパック",
  },
  {
    id: "credit-500",
    name: "500クレジット",
    credits: 500,
    priceYen: 2250,
    description: "まとめ買いでさらにお得",
  },
  {
    id: "credit-1000",
    name: "1000クレジット",
    credits: 1000,
    priceYen: 4200,
    description: "ヘビーユーザー向け大容量パック",
  },
];

export function findCreditPackage(packageId: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find((pkg) => pkg.id === packageId);
}

export const GENERATION_CREDIT_COST = 10;
