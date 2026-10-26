import { getPurchaseMode, resolveTransactionRevenue } from "./purchase-value";

/**
 * 売上に数える支払いか。
 *
 * - 本番の支払い(metadata.mode = 'live')だけ。テスト・見本の支払いは入れない
 * - purchase はすべて、subscription は金額が決まるものだけ
 *
 * 今のダッシュボード(get-admin-dashboard-data)と概要の両方がこれを使う。
 * 決まりを書き写して、売上の数が画面ごとにずれないようにするため。
 */
export function isRevenueTransaction(transaction: {
  amount: number;
  transaction_type: string;
  metadata: Record<string, unknown> | null;
}): boolean {
  if (getPurchaseMode(transaction.metadata) !== "live") {
    return false;
  }

  if (transaction.transaction_type === "purchase") {
    return true;
  }

  if (transaction.transaction_type === "subscription") {
    const { yenValue } = resolveTransactionRevenue({
      amount: transaction.amount,
      transactionType: transaction.transaction_type,
      metadata: transaction.metadata,
    });
    return yenValue !== null;
  }

  return false;
}
