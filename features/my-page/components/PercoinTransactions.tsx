"use client";

import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import {
  ADMIN_PERCOIN_BALANCE_TYPE_BADGE_CLASSES,
  isAdminPercoinBalanceType,
} from "@/features/credits/lib/admin-percoin-balance-type";
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
  metadata: Record<string, unknown> | null | undefined,
  labels: {
    purchase: string;
    consumption: string;
    refund: string;
    signupBonus: string;
    dailyPost: string;
    streak: string;
    referral: string;
    adminBonusDefault: string;
    adminDeductionDefault: string;
    tourBonus: string;
    forfeiture: string;
  }
) {
  switch (type) {
    case "purchase":
      return labels.purchase;
    case "consumption":
      return labels.consumption;
    case "refund":
      return labels.refund;
    case "signup_bonus":
      return labels.signupBonus;
    case "daily_post":
      return labels.dailyPost;
    case "streak":
      return labels.streak;
    case "referral":
      return labels.referral;
    case "admin_bonus":
      if (metadata && typeof metadata.reason === "string" && metadata.reason.trim()) {
        return metadata.reason;
      }
      return labels.adminBonusDefault;
    case "admin_deduction":
      if (metadata && typeof metadata.reason === "string" && metadata.reason.trim()) {
        return metadata.reason;
      }
      return labels.adminDeductionDefault;
    case "tour_bonus":
      return labels.tourBonus;
    case "forfeiture":
      return labels.forfeiture;
    default:
      return type;
  }
}

function formatExpireAt(expireAt: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(expireAt));
}

function toPositiveInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function getUsageBreakdownText(
  transaction: PercoinTransaction,
  labels: {
    periodLimited: (amount: number) => string;
    unlimitedBonus: (amount: number) => string;
    paid: (amount: number) => string;
    prefix: (details: string) => string;
  }
): string | null {
  const metadata = (transaction.metadata ?? {}) as Record<string, unknown>;
  if (
    transaction.transaction_type !== "consumption" &&
    transaction.transaction_type !== "refund"
  ) {
    return null;
  }

  const periodLimitedKey =
    transaction.transaction_type === "consumption"
      ? "from_period_limited"
      : "to_period_limited";
  const periodLimitedFallbackKey =
    transaction.transaction_type === "consumption" ? "from_promo" : "to_promo";
  const hasPeriodLimitedKey = Object.prototype.hasOwnProperty.call(
    metadata,
    periodLimitedKey
  );
  const periodLimited = hasPeriodLimitedKey
    ? toPositiveInt(metadata[periodLimitedKey])
    : toPositiveInt(metadata[periodLimitedFallbackKey]);

  const unlimitedBonus = toPositiveInt(
    metadata[
      transaction.transaction_type === "consumption"
        ? "from_unlimited_bonus"
        : "to_unlimited_bonus"
    ]
  );

  const paid = toPositiveInt(
    metadata[
      transaction.transaction_type === "consumption" ? "from_paid" : "to_paid"
    ]
  );

  if (periodLimited <= 0 && unlimitedBonus <= 0 && paid <= 0) {
    return null;
  }

  const parts: string[] = [];
  if (periodLimited > 0) {
    parts.push(labels.periodLimited(periodLimited));
  }
  if (unlimitedBonus > 0) {
    parts.push(labels.unlimitedBonus(unlimitedBonus));
  }
  if (paid > 0) {
    parts.push(labels.paid(paid));
  }

  return parts.length > 0 ? labels.prefix(parts.join(" / ")) : null;
}

function getBalanceTypeBadge(
  transaction: PercoinTransaction,
  labels: {
    periodLimited: string;
    unlimited: string;
  }
): { label: string; className: string } | null {
  const balanceType = transaction.metadata?.balance_type;

  if (isAdminPercoinBalanceType(balanceType)) {
    return {
      label:
        balanceType === "period_limited"
          ? labels.periodLimited
          : labels.unlimited,
      className: ADMIN_PERCOIN_BALANCE_TYPE_BADGE_CLASSES[balanceType],
    };
  }

  if (transaction.expire_at && transaction.transaction_type !== "refund") {
    return {
      label: labels.periodLimited,
      className: ADMIN_PERCOIN_BALANCE_TYPE_BADGE_CLASSES.period_limited,
    };
  }

  return null;
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
  const t = useTranslations("credits");
  const locale = useLocale();
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
    all: t("emptyAll"),
    regular: t("emptyRegular"),
    period_limited: t("emptyPeriodLimited"),
    usage: t("emptyUsage"),
  };
  const transactionTypeLabels = {
    purchase: t("transactionTypePurchase"),
    consumption: t("transactionTypeConsumption"),
    refund: t("transactionTypeRefund"),
    signupBonus: t("transactionTypeSignupBonus"),
    dailyPost: t("transactionTypeDailyPost"),
    streak: t("transactionTypeStreak"),
    referral: t("transactionTypeReferral"),
    adminBonusDefault: t("transactionTypeAdminBonusDefault"),
    adminDeductionDefault: t("transactionTypeAdminDeductionDefault"),
    tourBonus: t("transactionTypeTourBonus"),
    forfeiture: t("transactionTypeForfeiture"),
  };
  const usageBreakdownLabels = {
    periodLimited: (amount: number) => t("breakdownPeriodLimited", { amount }),
    unlimitedBonus: (amount: number) =>
      t("breakdownUnlimitedBonus", { amount }),
    paid: (amount: number) => t("breakdownPaid", { amount }),
    prefix: (details: string) => t("breakdownPrefix", { details }),
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
        <h2 className="text-xl font-semibold text-gray-900">{t("transactionHistoryTitle")}</h2>
        <p className="mt-0.5 text-xs text-gray-500">{t("transactionHistoryUnit")}</p>
      </div>

      {/* タブ（1行・等幅でスクロール不要、touch-target 44px 維持） */}
      <div
        role="tablist"
        aria-label={t("transactionFilterLabel")}
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
            {f === "all" && t("filterAll")}
            {f === "regular" && t("filterRegular")}
            {f === "period_limited" && t("filterPeriodLimited")}
            {f === "usage" && t("filterUsage")}
          </button>
        ))}
      </div>

      {/* 取引一覧 */}
      <div id="percoin-transactions-list" role="tabpanel" aria-labelledby={`tab-${filter}`}>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">{t("loading")}</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-gray-500">
            {emptyMessageByFilter[filter]}
          </p>
        ) : (
          <ul className="space-y-3">
            {transactions.map((tx) => {
              const balanceTypeBadge = getBalanceTypeBadge(tx, {
                periodLimited: t("badgePeriodLimited"),
                unlimited: t("badgeUnlimited"),
              });
              const usageBreakdown = getUsageBreakdownText(tx, usageBreakdownLabels);

              return (
                <li key={tx.id} className="rounded border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 break-words min-w-0 flex-1">
                      {formatTransactionType(
                        tx.transaction_type,
                        tx.metadata,
                        transactionTypeLabels
                      )}
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
                    <span>
                      {new Date(tx.created_at).toLocaleString(
                        locale === "ja" ? "ja-JP" : "en-US"
                      )}
                    </span>
                    {tx.expire_at && tx.transaction_type !== "refund" && (
                      <span>
                        {t("expireAt", {
                          date: formatExpireAt(tx.expire_at, locale),
                        })}
                      </span>
                    )}
                    {usageBreakdown && (
                      <span className="font-medium text-gray-600">{usageBreakdown}</span>
                    )}
                    <div className="flex gap-2">
                      {balanceTypeBadge && (
                        <span className={balanceTypeBadge.className}>
                          {balanceTypeBadge.label}
                        </span>
                      )}
                      {((tx.metadata as { mode?: string } | null)?.mode === "mock") && (
                        <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600">
                          {t("badgeMock")}
                        </span>
                      )}
                      {((tx.metadata as { mode?: string } | null)?.mode === "test") && (
                        <span className="rounded bg-yellow-100 px-2 py-1 text-[10px] font-medium text-yellow-700">
                          {t("badgeTest")}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* ページネーション（画像参考: ページ番号 + NEXT） */}
        {totalPages > 1 && (
          <nav
            className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-gray-200 pt-4"
            aria-label={t("paginationLabel")}
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
                aria-label={t("goToPage", { page })}
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
              aria-label={t("nextPage")}
            >
              {t("next")}
            </button>
          </nav>
        )}
      </div>
    </Card>
  );
}
