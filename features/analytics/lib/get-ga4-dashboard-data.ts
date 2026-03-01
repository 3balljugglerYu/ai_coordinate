import "server-only";

import type { DashboardRange } from "@/features/admin-dashboard/lib/dashboard-range";
import { getGa4PageFlowData } from "./get-ga4-page-flow-data";
import { getGa4PageSummaryData } from "./get-ga4-page-summary-data";
import type { Ga4DashboardData } from "./ga4-types";

export async function getGa4DashboardData(
  range: DashboardRange
): Promise<Ga4DashboardData> {
  const [pageSummaryResult, pageFlowResult] = await Promise.allSettled([
    getGa4PageSummaryData(range),
    getGa4PageFlowData(range),
  ]);

  const pageSummary =
    pageSummaryResult.status === "fulfilled"
      ? pageSummaryResult.value
      : {
          status: "error" as const,
          statusMessage:
            "GA4 データの取得に失敗しました。認証情報、Property 権限、または外部通信設定を確認してください。",
          topPages: [],
          topLandingPages: [],
        };

  const pageFlow =
    pageFlowResult.status === "fulfilled"
      ? pageFlowResult.value
      : {
          pageFlowStatus: "error" as const,
          pageFlowStatusMessage:
            "BigQuery からページ遷移と導線離脱を取得できませんでした。dataset 名、location、権限を確認してください。",
          topTransitions: [],
          topDropoffPages: [],
        };

  return {
    range,
    ...pageSummary,
    ...pageFlow,
  };
}
