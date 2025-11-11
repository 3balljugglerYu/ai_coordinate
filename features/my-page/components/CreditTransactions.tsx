import { Card } from "@/components/ui/card";
import type { CreditTransaction } from "@/features/my-page/lib/api";

interface CreditTransactionsProps {
  transactions: CreditTransaction[];
}

function formatTransactionType(type: string) {
  switch (type) {
    case "purchase":
      return "購入";
    case "consumption":
      return "消費";
    case "refund":
      return "返金";
    case "signup_bonus":
      return "新規登録特典";
    case "daily_post":
      return "デイリー特典";
    case "streak":
      return "ストリークトークン";
    case "referral":
      return "紹介特典";
    default:
      return type;
  }
}

export function CreditTransactions({ transactions }: CreditTransactionsProps) {
  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900">最近の取引履歴</h2>
        <p className="mt-2 text-sm text-gray-600">
          モック購入や画像生成によるクレジット消費の履歴が表示されます。
        </p>
      </div>

      {transactions.length === 0 ? (
        <p className="text-sm text-gray-500">
          まだ取引履歴がありません。クレジットを購入するか、画像を生成すると履歴が表示されます。
        </p>
      ) : (
        <ul className="space-y-3">
          {transactions.map((tx) => (
            <li key={tx.id} className="rounded border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  {formatTransactionType(tx.transaction_type)}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    tx.amount >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {tx.amount >= 0 ? "+" : ""}
                  {tx.amount}クレジット
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>{new Date(tx.created_at).toLocaleString("ja-JP")}</span>
                {((tx.metadata as { mode?: string } | null)?.mode === "mock") && (
                  <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600">
                    モック
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
