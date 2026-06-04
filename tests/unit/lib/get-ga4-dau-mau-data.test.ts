/** @jest-environment node */

import { buildGa4DauMauData } from "@/features/analytics/lib/get-ga4-dau-mau-data";
import { getGa4BigQueryClient } from "@/features/analytics/lib/ga4-bigquery-client";
import {
  hasGa4BigQueryConfig,
  hasGa4IntradayTable,
} from "@/features/analytics/lib/ga4-bigquery-utils";

jest.mock("@/features/analytics/lib/ga4-bigquery-client", () => ({
  getGa4BigQueryClient: jest.fn(),
}));

// hasGa4BigQueryConfig / hasGa4IntradayTable のみ差し替え、parseGa4Metric などは実物を使う
jest.mock("@/features/analytics/lib/ga4-bigquery-utils", () => {
  const actual = jest.requireActual(
    "@/features/analytics/lib/ga4-bigquery-utils"
  );
  return {
    ...actual,
    hasGa4BigQueryConfig: jest.fn(),
    hasGa4IntradayTable: jest.fn(),
  };
});

const mockGetClient = getGa4BigQueryClient as jest.MockedFunction<
  typeof getGa4BigQueryClient
>;
const mockHasConfig = hasGa4BigQueryConfig as jest.MockedFunction<
  typeof hasGa4BigQueryConfig
>;
const mockHasIntraday = hasGa4IntradayTable as jest.MockedFunction<
  typeof hasGa4IntradayTable
>;

function mockClient(query: jest.Mock) {
  mockGetClient.mockReturnValue({ query } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHasIntraday.mockResolvedValue(false);
});

describe("buildGa4DauMauData", () => {
  test("BigQuery未設定_disabledを返す", async () => {
    mockHasConfig.mockReturnValue(false);

    const result = await buildGa4DauMauData("7d");

    expect(result.dauMauStatus).toBe("disabled");
    expect(result.dauRows).toEqual([]);
    expect(result.mau).toBe(0);
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  test("成功_DAU行をマッピングしMAUスカラーを返す", async () => {
    mockHasConfig.mockReturnValue(true);
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        [
          { dateKey: "2026-03-01", loggedIn: "2", guest: "1", unknown: "0" },
          { dateKey: "2026-03-02", loggedIn: 3, guest: 0, unknown: 1 },
        ],
      ])
      .mockResolvedValueOnce([[{ mau: "9" }]]);
    mockClient(query);

    const result = await buildGa4DauMauData("7d");

    expect(result.dauMauStatus).toBe("ready");
    expect(result.dauMauStatusMessage).toBeNull();
    expect(result.dauRows).toEqual([
      { dateKey: "2026-03-01", loggedIn: 2, guest: 1, unknown: 0 },
      { dateKey: "2026-03-02", loggedIn: 3, guest: 0, unknown: 1 },
    ]);
    expect(result.mau).toBe(9); // 文字列も parseGa4Metric で数値化
    expect(query).toHaveBeenCalledTimes(2); // DAU系列 + MAUスカラー
  });

  test("MAU結果が空でも0で返す", async () => {
    mockHasConfig.mockReturnValue(true);
    const query = jest
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    mockClient(query);

    const result = await buildGa4DauMauData("30d");

    expect(result.dauMauStatus).toBe("ready");
    expect(result.dauRows).toEqual([]);
    expect(result.mau).toBe(0);
  });

  describe("クエリ失敗_エラー文言を分類して返す", () => {
    let consoleSpy: jest.SpyInstance;
    beforeEach(() => {
      consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockHasConfig.mockReturnValue(true);
    });
    afterEach(() => {
      consoleSpy.mockRestore();
    });

    test.each([
      ["permission denied", "権限"],
      ["table not found", "見つかりません"],
      ["location mismatch", "location"],
      ["something exploded", "取得できませんでした"],
    ])("%s → %s を含むメッセージ", async (errorMessage, expectedFragment) => {
      const query = jest.fn().mockRejectedValue(new Error(errorMessage));
      mockClient(query);

      const result = await buildGa4DauMauData("7d");

      expect(result.dauMauStatus).toBe("error");
      expect(result.dauMauStatusMessage).toContain(expectedFragment);
      expect(result.dauRows).toEqual([]);
      expect(result.mau).toBe(0);
    });
  });
});
