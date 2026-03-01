"use client";

import { Card } from "@/components/ui/card";
import {
  type PercoinTransaction,
  type PercoinTransactionFilter,
  PERCOIN_TRANSACTIONS_PER_PAGE,
} from "@/features/my-page/lib/api";

interface PercoinTransactionsProps {
  transactions: PercoinTransaction[];
  filter: PercoinTransactionFilter;
  offset: number;
  totalCount: number | null;
  isLoading: boolean;
  onFilterChange: (filter: PercoinTransactionFilter) => void;
  onPageClick: (page: number) => void;
  onNextPage: () => void;
  /** ページネーションクリック時にスクロールする要素の id */
  scrollTargetId?: string;
}

function formatTransactionType(
  type: string,
  metadata?: Record<string, unknown> | null
) {
  switch (type) {
    case "purchase":
      return "購入";
    case "consumption":
      return "生成利用";
    case "refund":
      return "生成失敗返却";
    case "signup_bonus":
      return "新規登録ボーナス";
    case "daily_post":
      return "デイリー投稿ボーナス";
    case "streak":
      return "連続ログインボーナス";
    case "referral":
      return "紹介ボーナス";
    case "admin_bonus":
      if (metadata && typeof metadata.reason === "string" && metadata.reason.trim()) {
        return metadata.reason;
      }
      return "運営者からのボーナス";
    case "admin_deduction":
      if (metadata && typeof metadata.reason === "string" && metadata.reason.trim()) {
        return metadata.reason;
      }
      return "運営による減算";
    case "tour_bonus":
      return "チュートリアルボーナス";
    case "forfeiture":
      return "退会による放棄";
    default:
      return type;
  }
}

function formatExpireAt(expireAt: string): string {
  const d = new Date(expireAt);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日迄`;
}

export function PercoinTransactions({
  transactions,
  filter,
  offset,
  totalCount,
  isLoading,
  onFilterChange,
  onPageClick,
  onNextPage,
  scrollTargetId = "percoin-transactions",
}: PercoinTransactionsProps) {
  const scrollToTitle = () => {
    const el = document.getElementById(scrollTargetId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handlePageClick = (page: number) => {
    onPageClick(page);
    scrollToTitle();
  };

  const handleNextPage = () => {
    onNextPage();
    scrollToTitle();
  };
  const emptyMessageByFilter: Record<PercoinTransactionFilter, string> = {
    all: "まだ取引履歴がありません。画像を生成すると履歴が表示されます。",
    regular: "取引履歴がありません。",
    period_limited: "期間限定の取引履歴がありません。",
    usage: "利用履歴がありません。",
  };
  const currentPage = Math.floor(offset / PERCOIN_TRANSACTIONS_PER_PAGE) + 1;
  const totalPages =
    totalCount !== null
      ? Math.max(1, Math.ceil(totalCount / PERCOIN_TRANSACTIONS_PER_PAGE))
      : 0;
  const hasNextPage =
    totalCount !== null &&
    offset + PERCOIN_TRANSACTIONS_PER_PAGE < totalCount;

  // 表示するページ番号（最大5つ、スライディングウィンドウ）
  const getPageNumbers = (): number[] => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const half = 2;
    let start = Math.max(1, currentPage - half);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };
  const pageNumbers = getPageNumbers();

  return (
    <Card className="p-6">
      <div id={scrollTargetId} className="mb-4 scroll-mt-4">
        <h2 className="text-xl font-semibold text-gray-900">取引履歴</h2>
        <p className="mt-0.5 text-xs text-gray-500">単位: ペルコイン</p>
      </div>

      {/* タブ（1行・等幅でスクロール不要、touch-target 44px 維持） */}
      <div
        role="tablist"
        aria-label="取引履歴のフィルタ"
        className="mb-4 flex gap-1 sm:gap-2"
      >
        {(["all", "regular", "period_limited", "usage"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            aria-controls="percoin-transactions-list"
            id={`tab-${f}`}
            onClick={() => onFilterChange(f)}
            className={`min-h-[44px] min-w-0 flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-3 sm:text-sm ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {f === "all" && "すべて"}
            {f === "regular" && "無期限"}
            {f === "period_limited" && "期間限定"}
            {f === "usage" && "利用履歴"}
          </button>
        ))}
      </div>

      {/* 取引一覧 */}
      <div id="percoin-transactions-list" role="tabpanel" aria-labelledby={`tab-${filter}`}>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">読み込み中...</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-gray-500">
            {emptyMessageByFilter[filter]}
          </p>
        ) : (
          <ul className="space-y-3">
            {transactions.map((tx) => (
              <li key={tx.id} className="rounded border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 break-words min-w-0 flex-1">
                    {formatTransactionType(tx.transaction_type, tx.metadata)}
                  </span>
                  <span
                    className={`text-sm font-semibold shrink-0 whitespace-nowrap ${
                      tx.amount >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {tx.amount >= 0 ? "+" : ""}
                    {tx.amount}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>{new Date(tx.created_at).toLocaleString("ja-JP")}</span>
                  {tx.expire_at && tx.transaction_type !== "refund" && (
                    <span>有効期限: {formatExpireAt(tx.expire_at)}</span>
                  )}
                  <div className="flex gap-2">
                    {tx.expire_at && tx.transaction_type !== "refund" && (
                      <span className="rounded bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-800">
                        期間限定
                      </span>
                    )}
                    {((tx.metadata as { mode?: string } | null)?.mode === "mock") && (
                      <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600">
                        モック
                      </span>
                    )}
                    {((tx.metadata as { mode?: string } | null)?.mode === "test") && (
                      <span className="rounded bg-yellow-100 px-2 py-1 text-[10px] font-medium text-yellow-700">
                        テスト
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* ページネーション（画像参考: ページ番号 + NEXT） */}
        {totalPages > 1 && (
          <nav
            className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-gray-200 pt-4"
            aria-label="取引履歴のページネーション"
          >
            {pageNumbers.map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => handlePageClick(page)}
                disabled={isLoading}
                className={`min-h-[40px] min-w-[40px] rounded border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  page === currentPage
                    ? "border-gray-400 bg-gray-200 text-gray-800"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
                aria-label={`${page}ページへ`}
                aria-current={page === currentPage ? "page" : undefined}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={handleNextPage}
              disabled={!hasNextPage || isLoading}
              className="min-h-[40px] rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="次のページへ"
            >
              NEXT
            </button>
          </nav>
        )}
      </div>
    </Card>
  );
}
