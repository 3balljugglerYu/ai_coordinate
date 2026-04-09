import { act, render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { PercoinPageContent } from "@/features/my-page/components/PercoinPageContent";
import {
  getCurrentUser,
  onAuthStateChange,
} from "@/features/auth/lib/auth-client";
import {
  getFreePercoinBatchesExpiring,
  getPercoinBalanceBreakdown,
  getPercoinTransactions,
  getPercoinTransactionsCount,
  type FreePercoinBatchExpiring,
  type PercoinBalanceBreakdown,
  type PercoinTransaction,
} from "@/features/my-page/lib/api";

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  getCurrentUser: jest.fn(),
  onAuthStateChange: jest.fn(),
}));

jest.mock("@/features/my-page/lib/api", () => ({
  PERCOIN_TRANSACTIONS_PER_PAGE: 30,
  getPercoinBalanceBreakdown: jest.fn(),
  getPercoinTransactions: jest.fn(),
  getPercoinTransactionsCount: jest.fn(),
  getFreePercoinBatchesExpiring: jest.fn(),
}));

jest.mock("@/features/my-page/components/PercoinTransactions", () => ({
  PercoinTransactions: ({
    transactions,
    totalCount,
  }: {
    transactions: PercoinTransaction[];
    totalCount: number | null;
  }) => (
    <div
      data-testid="percoin-transactions"
      data-count={String(transactions.length)}
      data-total-count={String(totalCount)}
    />
  ),
}));

jest.mock("@/features/my-page/components/PeriodLimitedBreakdown", () => ({
  PeriodLimitedBreakdown: ({ variant }: { variant: string }) => (
    <div data-testid={`period-limited-${variant}`} />
  ),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const getCurrentUserMock = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const onAuthStateChangeMock = onAuthStateChange as jest.MockedFunction<
  typeof onAuthStateChange
>;
const getPercoinBalanceBreakdownMock =
  getPercoinBalanceBreakdown as jest.MockedFunction<
    typeof getPercoinBalanceBreakdown
  >;
const getPercoinTransactionsMock = getPercoinTransactions as jest.MockedFunction<
  typeof getPercoinTransactions
>;
const getPercoinTransactionsCountMock =
  getPercoinTransactionsCount as jest.MockedFunction<
    typeof getPercoinTransactionsCount
  >;
const getFreePercoinBatchesExpiringMock =
  getFreePercoinBatchesExpiring as jest.MockedFunction<
    typeof getFreePercoinBatchesExpiring
  >;

const messages: Record<string, string> = {
  balanceLabel: "保有ペルコイン",
  percoinUnit: "ペルコイン",
};

const initialBreakdown: PercoinBalanceBreakdown = {
  total: 450,
  regular: 50,
  paid: 0,
  unlimited_bonus: 0,
  period_limited: 400,
};

const initialTransactions: PercoinTransaction[] = [
  {
    id: "tx-initial",
    amount: 400,
    transaction_type: "subscription",
    metadata: null,
    created_at: "2026-04-08T00:14:20.636Z",
    expire_at: "2026-10-31T14:59:59.000Z",
  },
];

const initialExpiringBatches: FreePercoinBatchExpiring[] = [
  {
    id: "batch-1",
    user_id: "user-1",
    remaining_amount: 400,
    expire_at: "2026-10-31T14:59:59.000Z",
    source: "subscription",
  },
];

describe("PercoinPageContent", () => {
  let authChangeCallback: ((user: { id: string } | null) => void) | null = null;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    useTranslationsMock.mockImplementation(
      () =>
        ((key: string) => messages[key] ?? key) as ReturnType<typeof useTranslations>
    );

    authChangeCallback = null;
    onAuthStateChangeMock.mockImplementation((callback) => {
      authChangeCallback = callback as (user: { id: string } | null) => void;
      return {
        unsubscribe: jest.fn(),
      } as ReturnType<typeof onAuthStateChange>;
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("client refresh failsでもSSRの残高と履歴を維持する", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" } as Awaited<
      ReturnType<typeof getCurrentUser>
    >);
    getPercoinBalanceBreakdownMock.mockRejectedValue(
      new Error("auth drift during refresh")
    );
    getPercoinTransactionsMock.mockResolvedValue([
      ...initialTransactions,
      {
        id: "tx-new",
        amount: 800,
        transaction_type: "subscription",
        metadata: null,
        created_at: "2026-05-08T00:14:20.636Z",
        expire_at: "2026-11-30T14:59:59.000Z",
      },
    ]);
    getFreePercoinBatchesExpiringMock.mockResolvedValue(initialExpiringBatches);
    getPercoinTransactionsCountMock.mockResolvedValue(2);

    render(
      <PercoinPageContent
        balanceBreakdown={initialBreakdown}
        transactions={initialTransactions}
        expiringBatches={initialExpiringBatches}
      />
    );

    await waitFor(() => {
      expect(getPercoinBalanceBreakdownMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText(/450\s*ペルコイン/)).toBeInTheDocument();
    expect(screen.getByTestId("percoin-transactions")).toHaveAttribute(
      "data-count",
      "1"
    );
    expect(screen.getByTestId("percoin-transactions")).toHaveAttribute(
      "data-total-count",
      "null"
    );
  });

  test("auth確立後に最新の残高と履歴へ更新する", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    getPercoinBalanceBreakdownMock.mockResolvedValue({
      total: 850,
      regular: 50,
      paid: 0,
      unlimited_bonus: 0,
      period_limited: 800,
    });
    getPercoinTransactionsMock.mockResolvedValue([
      ...initialTransactions,
      {
        id: "tx-renewal",
        amount: 400,
        transaction_type: "subscription",
        metadata: null,
        created_at: "2026-05-08T00:14:20.636Z",
        expire_at: "2026-11-30T14:59:59.000Z",
      },
    ]);
    getFreePercoinBatchesExpiringMock.mockResolvedValue([
      ...initialExpiringBatches,
      {
        id: "batch-2",
        user_id: "user-1",
        remaining_amount: 400,
        expire_at: "2026-11-30T14:59:59.000Z",
        source: "subscription",
      },
    ]);
    getPercoinTransactionsCountMock.mockResolvedValue(2);

    render(
      <PercoinPageContent
        balanceBreakdown={initialBreakdown}
        transactions={initialTransactions}
        expiringBatches={initialExpiringBatches}
      />
    );

    expect(screen.getByText(/450\s*ペルコイン/)).toBeInTheDocument();

    await act(async () => {
      authChangeCallback?.({ id: "user-1" });
    });

    await waitFor(() => {
      expect(screen.getByText(/850\s*ペルコイン/)).toBeInTheDocument();
    });
    expect(screen.getByTestId("percoin-transactions")).toHaveAttribute(
      "data-count",
      "2"
    );
    expect(screen.getByTestId("percoin-transactions")).toHaveAttribute(
      "data-total-count",
      "2"
    );
  });
});
