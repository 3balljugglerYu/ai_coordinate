/**
 * Stripe Price IDマッピングテーブル（Webhook処理用）
 * Price IDからペルコイン数を取得するためのマッピング
 */

// Webhook処理専用のPrice ID → ペルコイン数のマッピング
// Stripeの実際のPrice IDとペルコイン数を対応付け
export const STRIPE_PRICE_ID_TO_PERCOINS: Record<string, number> = {
  // テスト環境のPrice ID
  "price_1So3VWEtgRYjQynQFp1IBmUG": 110, // 110ペルコイン（500円）- テスト環境
  "price_1So3W8EtgRYjQynQKACSaUuf": 240, // 240ペルコイン（1000円）- テスト環境
  "price_1So3WaEtgRYjQynQmDFItWJG": 960, // 960ペルコイン（3000円）- テスト環境
  "price_1So3X8EtgRYjQynQ6FbbGnkD": 1900, // 1900ペルコイン（5000円）- テスト環境
  "price_1SoAzfEtgRYjQynQ8ZA8EgvZ": 4800, // 4800ペルコイン（10000円）- テスト環境
  // 本番環境のPrice ID
  "price_1So0f9ImYtwDZrxbiT1nLlS7": 110, // 110ペルコイン（500円）
  "price_1So0o1ImYtwDZrxbw9P7P2cG": 240, // 240ペルコイン（1000円）
  "price_1So0pGImYtwDZrxbDTih5U7n": 960, // 960ペルコイン（3000円）
  "price_1So0rMImYtwDZrxb22AS2zY6": 1900, // 1900ペルコイン（5000円）
  "price_1So11aImYtwDZrxbYeCcIt2b": 4800, // 4800ペルコイン（10000円）
} as const;

/**
 * Price IDからペルコイン数を取得
 * @param priceId StripeのPrice ID
 * @returns ペルコイン数、見つからない場合はnull
 */
export function getPercoinsFromPriceId(priceId: string): number | null {
  return STRIPE_PRICE_ID_TO_PERCOINS[priceId] ?? null;
}
