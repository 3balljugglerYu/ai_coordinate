import { render, screen } from "@testing-library/react";
import { useLocale, useTranslations } from "next-intl";
import { PercoinTransactions } from "@/features/my-page/components/PercoinTransactions";
import type { PercoinTransaction } from "@/features/my-page/lib/api";

jest.mock("next-intl", () => ({
  useLocale: jest.fn(),
  useTranslations: jest.fn(),
}));

const useLocaleMock = useLocale as jest.MockedFunction<typeof useLocale>;
const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

const messages: Record<string, string> = {
  transactionHistoryTitle: "取引履歴",
  transactionHistoryUnit: "単位: ペルコイン",
  transactionFilterLabel: "取引履歴のフィルタ",
  filterAll: "すべて",
  filterRegular: "無期限",
  filterPeriodLimited: "期間限定",
  filterUsage: "利用履歴",
  loading: "読み込み中...",
  emptyAll: "まだ取引履歴がありません。",
  emptyRegular: "取引履歴がありません。",
  emptyPeriodLimited: "期間限定の取引履歴がありません。",
  emptyUsage: "利用履歴がありません。",
  transactionTypePurchase: "購入",
  transactionTypeConsumption: "生成利用",
  transactionTypeRefund: "生成失敗返却",
  transactionTypeSignupBonus: "新規登録ボーナス",
  transactionTypeDailyPost: "デイリー投稿ボーナス",
  transactionTypeStreak: "連続ログインボーナス",
  transactionTypeReferral: "紹介ボーナス",
  transactionTypeAdminBonusDefault: "運営者からのボーナス",
  transactionTypeAdminDeductionDefault: "運営による減算",
  transactionTypeTourBonus: "チュートリアルボーナス",
  transactionTypeForfeiture: "退会による放棄",
  expireAt: "有効期限: {date}",
  breakdownPrefix: "内訳: {details}",
  breakdownPeriodLimited: "期間限定 {amount}",
  breakdownUnlimitedBonus: "無期限付与 {amount}",
  breakdownPaid: "購入分 {amount}",
  badgePeriodLimited: "期間限定",
  badgeUnlimited: "無期限",
  badgeMock: "モック",
  badgeTest: "テスト",
  paginationLabel: "取引履歴のページネーション",
  goToPage: "{page}ページへ",
  nextPage: "次のページへ",
  next: "NEXT",
};

function translate(
  key: string,
  values?: Record<string, string | number>
): string {
  const template = messages[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, token: string) =>
    values && token in values ? String(values[token]) : `{${token}}`
  );
}

describe("PercoinTransactions", () => {
  beforeEach(() => {
    useLocaleMock.mockReturnValue("ja");
    useTranslationsMock.mockImplementation(
      () =>
        ((key: string, values?: Record<string, string | number>) =>
          translate(key, values)) as ReturnType<typeof useTranslations>
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders usage breakdown with translated amounts", () => {
    const transactions: PercoinTransaction[] = [
      {
        id: "tx-1",
        amount: -13,
        transaction_type: "consumption",
        metadata: {
          from_period_limited: 10,
          from_unlimited_bonus: 0,
          from_paid: 3,
        },
        created_at: "2026-03-27T04:07:53.766Z",
        expire_at: null,
      },
    ];

    render(
      <PercoinTransactions
        transactions={transactions}
        filter="usage"
        offset={0}
        totalCount={1}
        isLoading={false}
        onFilterChange={jest.fn()}
        onPageClick={jest.fn()}
        onNextPage={jest.fn()}
      />
    );

    expect(screen.getByText("内訳: 期間限定 10 / 購入分 3")).toBeInTheDocument();
  });
});
