import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";
import {
  getCollectionKpi,
  getCollectionUuFunnel,
} from "@/features/admin-dashboard/lib/get-collection-kpi";
import { getCollectionCompleters } from "@/features/admin-dashboard/lib/get-collection-completions";
import { getOperatorUserIds } from "@/features/admin-dashboard/lib/get-operator-user-ids";
import { getCollectionRetention } from "@/features/admin-dashboard/lib/get-collection-retention";
import { getCollectionCampaignSummaries } from "@/features/admin-dashboard/lib/get-collection-campaign-summaries";
import { resolveCampaignPeriod } from "@/features/admin-dashboard/lib/collection-campaign-period";
import {
  getCustomDashboardRangeBounds,
  parseCustomDashboardRange,
} from "@/features/admin-dashboard/lib/dashboard-range";

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;
const PAGE_SIZE = 20;

/**
 * GET /api/admin/collections?categoryKey=...&page=0
 * 指定シリーズの KPI と達成者一覧(ページング)を返す。admin 専用。
 *
 * `range=campaign`(既定)のときは、その企画の表示期間を集計期間にする(ADR-006)。
 * 表示期間が無い企画は従来どおり直近30日へ落ちる。
 */
export async function GET(request: NextRequest) {
  await connection();

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const categoryKey = request.nextUrl.searchParams.get("categoryKey") ?? "";
  const pageRaw = request.nextUrl.searchParams.get("page") ?? "0";
  const page = Number.parseInt(pageRaw, 10);
  const rangeParam = request.nextUrl.searchParams.get("range") ?? "campaign";

  if (!KEY_PATTERN.test(categoryKey)) {
    return NextResponse.json({ error: "invalid categoryKey" }, { status: 400 });
  }

  const category = await getPresetCategoryByKey(categoryKey);
  // コレクションシリーズ or 前提付き報酬コレクション(例: ぷち神)を admin KPI 対象にする。
  if (
    !category ||
    (!category.isCollectionSeries && category.unlockPrerequisiteKey == null)
  ) {
    return NextResponse.json(
      { error: "not a collection series" },
      { status: 404 },
    );
  }

  /*
    会期を既定にする。会期は DB にあるのだから毎回手入力させる理由がない。
    表示期間が無い / まだ始まっていない企画は resolveCampaignPeriod が null を返し、
    従来の既定(直近30日)に落ちる。
  */
  const wantsCampaignRange = rangeParam === "campaign";
  const campaignPeriod = wantsCampaignRange
    ? resolveCampaignPeriod({
        startsAt: category.collectionDisplayStartsAt,
        endsAt: category.collectionDisplayEndsAt,
      })
    : null;

  // 会期が解決できたら custom として扱う。解決できなければ従来の既定(30d)。
  const range = parseCustomDashboardRange(
    campaignPeriod ? "custom" : wantsCampaignRange ? "30d" : rangeParam,
  );
  const bounds = getCustomDashboardRangeBounds({
    range,
    from:
      campaignPeriod?.fromIso ??
      request.nextUrl.searchParams.get("from") ??
      undefined,
    to:
      campaignPeriod?.toIso ??
      request.nextUrl.searchParams.get("to") ??
      undefined,
  });

  try {
    const operatorUserIds = await getOperatorUserIds();

    const [kpi, uuFunnel, completers, retention, summaries] = await Promise.all([
      getCollectionKpi({
        categoryKey,
        categoryId: category.id,
        currentStart: bounds.currentStart,
        previousStart: bounds.previousStart,
        now: bounds.now,
        operatorUserIds,
      }),
      getCollectionUuFunnel({
        categoryKey,
        categoryId: category.id,
        currentStart: bounds.currentStart,
        now: bounds.now,
        operatorUserIds,
      }),
      getCollectionCompleters({
        categoryKey,
        page: Number.isFinite(page) ? page : 0,
        pageSize: PAGE_SIZE,
        operatorUserIds,
      }),
      getCollectionRetention({
        categoryKey,
        rangeStart: bounds.currentStart,
        rangeEnd: bounds.now,
        operatorUserIds,
      }),
      // 通算値なので企画を切り替えても同じ。キャッシュ済み(ADR-008)
      getCollectionCampaignSummaries(operatorUserIds),
    ]);

    return NextResponse.json({
      kpi,
      uuFunnel,
      completers,
      retention,
      summaries,
      /*
        黙って引くと「なぜこの数字なのか」が追えなくなるので、引いた事実を返す
        (ADR-002)。画面は「運営N名を除外中」を常時表示する。
      */
      operatorExcludedCount: operatorUserIds.length,
      // 実際に集計した期間。会期に落ちたのか30日に落ちたのかを画面で示す。
      resolvedRange: {
        fromIso: bounds.currentStart.toISOString(),
        toIso: bounds.now.toISOString(),
        source: campaignPeriod
          ? ("campaign" as const)
          : wantsCampaignRange
            ? ("fallback" as const)
            : ("explicit" as const),
        isOngoing: campaignPeriod?.isOngoing ?? false,
      },
    });
  } catch (error) {
    console.error("[admin collections GET] failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
