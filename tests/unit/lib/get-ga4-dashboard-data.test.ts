/** @jest-environment node */

import type { DashboardRange } from "@/features/admin-dashboard/lib/dashboard-range";
import { getGa4DashboardData } from "@/features/analytics/lib/get-ga4-dashboard-data";
import { getGa4EntryAccessData } from "@/features/analytics/lib/get-ga4-entry-access-data";
import { getGa4ExternalAccessData } from "@/features/analytics/lib/get-ga4-external-access-data";
import { getGa4PageFlowData } from "@/features/analytics/lib/get-ga4-page-flow-data";
import { getGa4PageSummaryData } from "@/features/analytics/lib/get-ga4-page-summary-data";

jest.mock("@/features/analytics/lib/get-ga4-page-summary-data");
jest.mock("@/features/analytics/lib/get-ga4-page-flow-data");
jest.mock("@/features/analytics/lib/get-ga4-entry-access-data");
jest.mock("@/features/analytics/lib/get-ga4-external-access-data");

const getGa4PageSummaryDataMock = getGa4PageSummaryData as jest.MockedFunction<
  typeof getGa4PageSummaryData
>;
const getGa4PageFlowDataMock = getGa4PageFlowData as jest.MockedFunction<
  typeof getGa4PageFlowData
>;
const getGa4EntryAccessDataMock = getGa4EntryAccessData as jest.MockedFunction<
  typeof getGa4EntryAccessData
>;
const getGa4ExternalAccessDataMock = getGa4ExternalAccessData as jest.MockedFunction<
  typeof getGa4ExternalAccessData
>;

const MSG_PAGE_SUMMARY_ERROR =
  "GA4 データの取得に失敗しました。認証情報、Property 権限、または外部通信設定を確認してください。";
const MSG_PAGE_FLOW_ERROR =
  "BigQuery からページ遷移と導線離脱を取得できませんでした。dataset 名、location、権限を確認してください。";
const MSG_ENTRY_ACCESS_ERROR =
  "BigQuery から入口ページ別アクセスを取得できませんでした。dataset 名、location、権限を確認してください。";
const MSG_EXTERNAL_ACCESS_ERROR =
  "BigQuery から外部流入アクセスを取得できませんでした。dataset 名、location、権限を確認してください。";

function pageSummaryOk() {
  return {
    status: "ready" as const,
    statusMessage: null as string | null,
    topPages: [{ path: "/a", title: "A", views: 1, activeUsers: 1 }],
    topLandingPages: [
      { landingPage: "/", sessions: 2, activeUsers: 2 },
    ],
  };
}

function pageFlowOk() {
  return {
    pageFlowStatus: "ready" as const,
    pageFlowStatusMessage: null as string | null,
    topTransitions: [
      {
        fromPage: "/",
        toPage: "/b",
        transitionCount: 1,
        sharePct: 0.5,
      },
    ],
    topDropoffPages: [
      {
        page: "/",
        reachedSessions: 1,
        continuedSessions: 1,
        dropoffSessions: 0,
        dropoffRate: 0,
      },
    ],
  };
}

function entryAccessOk() {
  return {
    entryAccessStatus: "ready" as const,
    entryAccessStatusMessage: null as string | null,
    entryAccessRows: [
      { dateKey: "2026-01-01", landingPage: "/", sessions: 1 },
    ],
    entryAccessDateKeys: ["2026-01-01"],
  };
}

function externalAccessOk() {
  return {
    externalAccessStatus: "ready" as const,
    externalAccessStatusMessage: null as string | null,
    externalAccessRows: [
      {
        dateKey: "2026-01-01",
        xSessions: 0,
        campfireSessions: 0,
        searchSessions: 0,
        otherExternalSessions: 0,
        totalExternalSessions: 0,
      },
    ],
  };
}

describe("getGa4DashboardData", () => {
  const range: DashboardRange = "7d";

  beforeEach(() => {
    jest.clearAllMocks();
    getGa4PageSummaryDataMock.mockResolvedValue(pageSummaryOk());
    getGa4PageFlowDataMock.mockResolvedValue(pageFlowOk());
    getGa4EntryAccessDataMock.mockResolvedValue(entryAccessOk());
    getGa4ExternalAccessDataMock.mockResolvedValue(externalAccessOk());
  });

  test("getGa4DashboardData_range指定_4取得を同一rangeで並行呼び出しする", async () => {
    // Spec: GA4DASH-001
    await getGa4DashboardData(range);
    expect(getGa4PageSummaryDataMock).toHaveBeenCalledTimes(1);
    expect(getGa4PageSummaryDataMock).toHaveBeenCalledWith(range);
    expect(getGa4PageFlowDataMock).toHaveBeenCalledTimes(1);
    expect(getGa4PageFlowDataMock).toHaveBeenCalledWith(range);
    expect(getGa4EntryAccessDataMock).toHaveBeenCalledTimes(1);
    expect(getGa4EntryAccessDataMock).toHaveBeenCalledWith(range);
    expect(getGa4ExternalAccessDataMock).toHaveBeenCalledTimes(1);
    expect(getGa4ExternalAccessDataMock).toHaveBeenCalledWith(range);
  });

  test("getGa4DashboardData_全成功の場合_rangeと結果をマージして返す", async () => {
    // Spec: GA4DASH-002
    const result = await getGa4DashboardData(range);
    expect(result.range).toBe(range);
    expect(result).toMatchObject({
      ...pageSummaryOk(),
      ...entryAccessOk(),
      ...externalAccessOk(),
      ...pageFlowOk(),
      range,
    });
  });

  test("getGa4DashboardData_ページサマリー失敗の場合_サマリー用errorスタブにする", async () => {
    // Spec: GA4DASH-003
    getGa4PageSummaryDataMock.mockRejectedValueOnce(new Error("ga4 down"));
    const result = await getGa4DashboardData(range);
    expect(result.status).toBe("error");
    expect(result.statusMessage).toBe(MSG_PAGE_SUMMARY_ERROR);
    expect(result.topPages).toEqual([]);
    expect(result.topLandingPages).toEqual([]);
    expect(result.pageFlowStatus).toBe("ready");
    expect(result.entryAccessStatus).toBe("ready");
    expect(result.externalAccessStatus).toBe("ready");
  });

  test("getGa4DashboardData_ページフロー失敗の場合_フロー用errorスタブにする", async () => {
    // Spec: GA4DASH-004
    getGa4PageFlowDataMock.mockRejectedValueOnce(new Error("bq flow"));
    const result = await getGa4DashboardData(range);
    expect(result.pageFlowStatus).toBe("error");
    expect(result.pageFlowStatusMessage).toBe(MSG_PAGE_FLOW_ERROR);
    expect(result.topTransitions).toEqual([]);
    expect(result.topDropoffPages).toEqual([]);
    expect(result.status).toBe("ready");
  });

  test("getGa4DashboardData_入口アクセス失敗の場合_入口用errorスタブにする", async () => {
    // Spec: GA4DASH-005
    getGa4EntryAccessDataMock.mockRejectedValueOnce(new Error("bq entry"));
    const result = await getGa4DashboardData(range);
    expect(result.entryAccessStatus).toBe("error");
    expect(result.entryAccessStatusMessage).toBe(MSG_ENTRY_ACCESS_ERROR);
    expect(result.entryAccessRows).toEqual([]);
    expect(result.entryAccessDateKeys).toEqual([]);
    expect(result.status).toBe("ready");
  });

  test("getGa4DashboardData_外部流入失敗の場合_外部流入用errorスタブにする", async () => {
    // Spec: GA4DASH-006
    getGa4ExternalAccessDataMock.mockRejectedValueOnce(new Error("bq ext"));
    const result = await getGa4DashboardData(range);
    expect(result.externalAccessStatus).toBe("error");
    expect(result.externalAccessStatusMessage).toBe(MSG_EXTERNAL_ACCESS_ERROR);
    expect(result.externalAccessRows).toEqual([]);
    expect(result.status).toBe("ready");
  });

  test("getGa4DashboardData_複数失敗の場合_独立スタブと成功部分を併せて返す", async () => {
    // Spec: GA4DASH-007
    getGa4PageSummaryDataMock.mockRejectedValueOnce(new Error("summary fail"));
    getGa4PageFlowDataMock.mockRejectedValueOnce(new Error("flow fail"));
    const result = await getGa4DashboardData(range);
    expect(result.range).toBe(range);
    expect(result.status).toBe("error");
    expect(result.statusMessage).toBe(MSG_PAGE_SUMMARY_ERROR);
    expect(result.topPages).toEqual([]);
    expect(result.pageFlowStatus).toBe("error");
    expect(result.pageFlowStatusMessage).toBe(MSG_PAGE_FLOW_ERROR);
    expect(result.topTransitions).toEqual([]);
    expect(result).toMatchObject(entryAccessOk());
    expect(result).toMatchObject(externalAccessOk());
  });
});
