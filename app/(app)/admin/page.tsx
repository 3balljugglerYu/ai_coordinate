import { AdminDashboardView } from "@/features/admin-dashboard/components/AdminDashboardView";
import {
  AdminCollectionsView,
  type AdminCollectionSeries,
} from "@/features/admin-dashboard/components/AdminCollectionsView";
import { AdminOneTapStyleFocusView } from "@/features/admin-dashboard/components/AdminOneTapStyleFocusView";
import { AdminPercoinView } from "@/features/admin-dashboard/components/AdminPercoinView";
import { AdminPageAnalyticsSectionServer } from "@/features/admin-dashboard/components/AdminPageAnalyticsSectionServer";
import { parseAdminDashboardTab } from "@/features/admin-dashboard/lib/dashboard-tab";
import { listPresetCategories } from "@/features/style-presets/lib/preset-category-repository";
import { getAdminDashboardData } from "@/features/admin-dashboard/lib/get-admin-dashboard-data";
import { getAiCostActuals } from "@/features/admin-dashboard/lib/get-ai-cost-actuals";
import { getPostImpressionStats } from "@/features/admin-dashboard/lib/get-post-impression-stats";
import { getPercoinAnalytics } from "@/features/admin-dashboard/lib/get-percoin-analytics";
import {
  formatAdminDateTimeLabel,
  getCustomDashboardRangeBounds,
  getOneTapStyleRangeBounds,
  parseCustomDashboardRange,
  parseDashboardRange,
  parseOneTapStyleDashboardRange,
} from "@/features/admin-dashboard/lib/dashboard-range";
import { getGa4DashboardData } from "@/features/analytics/lib/get-ga4-dashboard-data";
import { connection } from "next/server";

/** 期間タブの表示名。画面の「期間は◯◯」に使う */
const RANGE_LABELS: Record<string, string> = {
  "24h": "直近24時間",
  "7d": "直近7日",
  "30d": "直近30日",
  "90d": "直近90日",
};

interface AdminDashboardPageProps {
  searchParams?: Promise<{
    range?: string;
    tab?: string;
    styleRange?: string;
    styleFrom?: string;
    styleTo?: string;
    collectionRange?: string;
    collectionFrom?: string;
    collectionTo?: string;
  }>;
}

export default async function AdminDashboardPage({
  searchParams,
}: AdminDashboardPageProps) {
  await connection();

  const params = (await searchParams) ?? {};
  const range = parseDashboardRange(params.range);
  const tab = parseAdminDashboardTab(params.tab);
  const styleRange = parseOneTapStyleDashboardRange(params.styleRange);
  const oneTapStyleRangeBounds = getOneTapStyleRangeBounds({
    range: styleRange,
    from: params.styleFrom,
    to: params.styleTo,
  });
  const formattedStyleFrom = formatAdminDateTimeLabel(oneTapStyleRangeBounds.fromIso);
  const formattedStyleTo = formatAdminDateTimeLabel(oneTapStyleRangeBounds.toIso);
  const data = await getAdminDashboardData(range, oneTapStyleRangeBounds);

  const collectionRange = parseCustomDashboardRange(params.collectionRange);
  const collectionRangeBounds = getCustomDashboardRangeBounds({
    range: collectionRange,
    from: params.collectionFrom,
    to: params.collectionTo,
  });
  const formattedCollectionFrom = formatAdminDateTimeLabel(
    collectionRangeBounds.fromIso,
  );
  const formattedCollectionTo = formatAdminDateTimeLabel(
    collectionRangeBounds.toIso,
  );

  /*
    ペルコイン分析はタブを開いたときだけ引く。集計 RPC を4本叩くので、
    「すべて」タブの表示を毎回重くする理由がない。
  */
  const percoinAnalytics =
    tab === "percoin" ? await getPercoinAnalytics(range) : null;

  let collectionSeries: AdminCollectionSeries[] = [];
  if (tab === "collections") {
    const categories = await listPresetCategories({ includeInactive: true });
    // コレクションシリーズに加え、前提付きの報酬コレクション(例: ぷち神=
    // unlock_prerequisite_key あり / is_collection_series=false)も admin では常に表示する。
    // データ(完走・生成)は残るため、開催期間が終わっても KPI を確認できるようにする。
    collectionSeries = categories
      .filter((c) => c.isCollectionSeries || c.unlockPrerequisiteKey != null)
      .map((c) => ({
        key: c.key,
        displayName: c.displayNameJa,
        threshold: c.completionThreshold ?? 0,
      }));
  }

  return (
    <AdminDashboardView
      data={data}
      currentTab={tab}
      currentStyleRange={oneTapStyleRangeBounds.range}
      currentStyleFrom={oneTapStyleRangeBounds.fromIso}
      currentStyleTo={oneTapStyleRangeBounds.toIso}
    >
      {tab === "collections" ? (
        <AdminCollectionsView
          series={collectionSeries}
          globalRange={range}
          currentRange={collectionRangeBounds.range}
          currentFrom={collectionRangeBounds.fromIso}
          currentTo={collectionRangeBounds.toIso}
          currentFromLabel={formattedCollectionFrom}
          currentToLabel={formattedCollectionTo}
          /*
            未指定なら "campaign"(会期が既定)。会期の日付は企画ごとに違い
            サーバー側でしか解決できないため、生の値のまま API へ渡す。
          */
          rangeParam={params.collectionRange ?? "campaign"}
        />
      ) : tab === "percoin" && percoinAnalytics ? (
        <AdminPercoinView
          analytics={percoinAnalytics}
          rangeLabel={RANGE_LABELS[range]}
        />
      ) : tab === "one-tap-style" ? (
        <AdminOneTapStyleFocusView
          analytics={data.oneTapStyleDetailed}
          currentRange={range}
          currentStyleRange={oneTapStyleRangeBounds.range}
          currentStyleFrom={oneTapStyleRangeBounds.fromIso}
          currentStyleTo={oneTapStyleRangeBounds.toIso}
          currentStyleFromLabel={formattedStyleFrom}
          currentStyleToLabel={formattedStyleTo}
        />
      ) : (
        <AdminPageAnalyticsSectionServer
          ga4Promise={getGa4DashboardData(range)}
          trend={data.trend}
          oneTapStyle={data.oneTapStyle}
          funnel={data.funnel}
          modelMix={data.modelMix}
          loginMethodMix={data.loginMethodMix}
          aiCostEstimate={data.aiCostEstimate}
          aiCostActualsPromise={getAiCostActuals(range)}
          impressionsPromise={getPostImpressionStats(range)}
        />
      )}
    </AdminDashboardView>
  );
}
