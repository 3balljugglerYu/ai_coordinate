import { createAdminClient } from "@/lib/supabase/admin";
import { adminQuickActionItems } from "@/app/(app)/admin/admin-nav-items";
import { getGa4DashboardData } from "@/features/analytics/lib/get-ga4-dashboard-data";
import { PERCOIN_PACKAGES } from "@/features/credits/percoin-packages";
import {
  enumerateJstDateKeys,
  formatJstDateLabel,
  getRangeBounds,
  isWithinDateRange,
  toJstDateKey,
  type DashboardRange,
} from "./dashboard-range";
import {
  getPurchaseMode,
  resolvePurchasePackage,
} from "./purchase-value";
import type {
  AdminDashboardData,
  AdminDashboardKpi,
  DashboardAlertRow,
  DashboardFunnelStep,
  DashboardModelMixItem,
  DashboardOpsSummary,
  DashboardPurchaseRow,
  DashboardRevenueTrend,
  DashboardRevenueTrendPoint,
  DashboardTrendPoint,
} from "./dashboard-types";

type ProfileRow = {
  user_id: string;
  nickname: string | null;
  created_at: string;
};

type GeneratedImageRow = {
  user_id: string | null;
  created_at: string;
  is_posted: boolean | null;
  moderation_status: string | null;
  model: string | null;
  posted_at?: string | null;
};

type CreditTransactionRow = {
  id: string;
  user_id: string | null;
  amount: number;
  transaction_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ImageJobRow = {
  id: string;
  status: string;
  created_at: string;
};

type CreditBalanceRow = {
  user_id: string;
  balance: number;
  paid_balance: number;
};

type FreePercoinBatchRow = {
  user_id: string;
  remaining_amount: number;
  expire_at: string;
};

type PostReportRow = {
  post_id: string | null;
  weight: number | null;
  created_at: string;
};

const revenueSeriesColors = [
  "#0F766E",
  "#059669",
  "#10B981",
  "#34D399",
  "#6EE7B7",
] as const;

function formatInteger(value: number): string {
  return value.toLocaleString("ja-JP");
}

function formatYen(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function calculateDelta(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) {
      return { deltaPct: 0, deltaDirection: "flat" as const };
    }

    return { deltaPct: null, deltaDirection: "up" as const };
  }

  const deltaPct = Number(
    (((current - previous) / previous) * 100).toFixed(1)
  );

  if (deltaPct > 0) {
    return { deltaPct, deltaDirection: "up" as const };
  }

  if (deltaPct < 0) {
    return { deltaPct: Math.abs(deltaPct), deltaDirection: "down" as const };
  }

  return { deltaPct: 0, deltaDirection: "flat" as const };
}

function createKpi(params: {
  key: AdminDashboardKpi["key"];
  label: string;
  current: number;
  previous: number;
  formatValue?: (value: number) => string;
  subtext: string;
}): AdminDashboardKpi {
  const { deltaPct, deltaDirection } = calculateDelta(
    params.current,
    params.previous
  );

  return {
    key: params.key,
    label: params.label,
    value: (params.formatValue ?? formatInteger)(params.current),
    deltaPct,
    deltaDirection,
    subtext: params.subtext,
  };
}

function distinctUsers(rows: Array<{ user_id: string | null }>): Set<string> {
  return new Set(rows.map((row) => row.user_id).filter(Boolean) as string[]);
}

function buildTrend(params: {
  profiles: ProfileRow[];
  generations: GeneratedImageRow[];
  currentStart: Date;
  now: Date;
}): DashboardTrendPoint[] {
  const keys = enumerateJstDateKeys(params.currentStart, params.now);
  const trendMap = new Map<string, DashboardTrendPoint>(
    keys.map((key) => [
      key,
      {
        bucket: key,
        label: formatJstDateLabel(key),
        signups: 0,
        generations: 0,
      },
    ])
  );

  for (const profile of params.profiles) {
    const key = toJstDateKey(profile.created_at);
    const bucket = trendMap.get(key);
    if (bucket) {
      bucket.signups += 1;
    }
  }

  for (const generation of params.generations) {
    const key = toJstDateKey(generation.created_at);
    const bucket = trendMap.get(key);
    if (bucket) {
      bucket.generations += 1;
    }
  }

  return keys.map((key) => trendMap.get(key)!);
}

function buildRevenueTrend(params: {
  livePurchases: CreditTransactionRow[];
  currentStart: Date;
  now: Date;
}): DashboardRevenueTrend {
  const keys = enumerateJstDateKeys(params.currentStart, params.now);
  const pointsMap = new Map<string, DashboardRevenueTrendPoint>(
    keys.map((key) => [
      key,
      {
        bucket: key,
        label: formatJstDateLabel(key),
        totalRevenueYen: 0,
        breakdown: {},
      },
    ])
  );
  const knownSeries = new Map(
    PERCOIN_PACKAGES.map((pkg, index) => [
      pkg.id,
      {
        key: pkg.id,
        label: pkg.name,
        color: revenueSeriesColors[index % revenueSeriesColors.length],
      },
    ])
  );
  const dynamicSeries = new Map<string, { key: string; label: string; color: string }>();
  const usedSeriesKeys = new Set<string>();

  for (const purchase of params.livePurchases) {
    const point = pointsMap.get(toJstDateKey(purchase.created_at));
    if (!point) {
      continue;
    }

    const resolvedPackage = resolvePurchasePackage({
      amount: purchase.amount,
      metadata: purchase.metadata,
    });

    if (resolvedPackage.yenValue === null) {
      continue;
    }

    const known = knownSeries.get(resolvedPackage.key);
    if (!known && !dynamicSeries.has(resolvedPackage.key)) {
      dynamicSeries.set(resolvedPackage.key, {
        key: resolvedPackage.key,
        label: resolvedPackage.label,
        color: "#94A3B8",
      });
    }

    point.breakdown[resolvedPackage.key] =
      (point.breakdown[resolvedPackage.key] ?? 0) + resolvedPackage.yenValue;
    point.totalRevenueYen += resolvedPackage.yenValue;
    usedSeriesKeys.add(resolvedPackage.key);
  }

  const orderedSeries = [
    ...PERCOIN_PACKAGES.map((pkg) => knownSeries.get(pkg.id)!),
    ...dynamicSeries.values(),
  ].filter((series) => usedSeriesKeys.has(series.key));

  return {
    series: orderedSeries,
    points: keys.map((key) => pointsMap.get(key)!),
  };
}

function buildModelMix(generations: GeneratedImageRow[]): DashboardModelMixItem[] {
  const total = generations.length;
  const counts = new Map<string, number>();

  for (const generation of generations) {
    const model = generation.model ?? "unknown";
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([model, count]) => ({
      model,
      count,
      sharePct: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function buildFunnel(params: {
  signups: ProfileRow[];
  generations: GeneratedImageRow[];
  purchases: CreditTransactionRow[];
}): DashboardFunnelStep[] {
  const signupUsers = new Set(params.signups.map((profile) => profile.user_id));
  const generationUsers = distinctUsers(params.generations);
  const postedUsers = distinctUsers(
    params.generations.filter((generation) => generation.is_posted)
  );
  const purchaseUsers = distinctUsers(
    params.purchases.filter((purchase) => purchase.transaction_type === "purchase")
  );

  const steps: DashboardFunnelStep[] = [
    { label: "新規登録", users: signupUsers.size, rateFromPrevious: null },
    {
      label: "生成完了",
      users: generationUsers.size,
      rateFromPrevious:
        signupUsers.size > 0
          ? Number(((generationUsers.size / signupUsers.size) * 100).toFixed(1))
          : null,
    },
    {
      label: "投稿",
      users: postedUsers.size,
      rateFromPrevious:
        generationUsers.size > 0
          ? Number(((postedUsers.size / generationUsers.size) * 100).toFixed(1))
          : null,
    },
    {
      label: "購入",
      users: purchaseUsers.size,
      rateFromPrevious:
        postedUsers.size > 0
          ? Number(((purchaseUsers.size / postedUsers.size) * 100).toFixed(1))
          : null,
    },
  ];

  return steps;
}

function buildOpsSummary(params: {
  jobs: ImageJobRow[];
  livePurchases: CreditTransactionRow[];
  balances: CreditBalanceRow[];
  expiringBatches: FreePercoinBatchRow[];
}): DashboardOpsSummary {
  const failedJobs = params.jobs.filter((job) => job.status === "failed").length;
  const totalPaidBalance = params.balances.reduce(
    (sum, balance) => sum + (balance.paid_balance ?? 0),
    0
  );
  const totalPromoBalance = params.balances.reduce(
    (sum, balance) =>
      sum + Math.max((balance.balance ?? 0) - (balance.paid_balance ?? 0), 0),
    0
  );
  const expiringUsers = new Set(
    params.expiringBatches.map((batch) => batch.user_id)
  ).size;
  const expiringPercoins = params.expiringBatches.reduce(
    (sum, batch) => sum + (batch.remaining_amount ?? 0),
    0
  );
  const liveRevenueTotal = params.livePurchases.reduce((sum, purchase) => {
    const { yenValue } = resolvePurchasePackage({
      amount: purchase.amount,
      metadata: purchase.metadata,
    });

    return sum + (yenValue ?? 0);
  }, 0);
  const purchasingUsers = distinctUsers(params.livePurchases).size;
  const purchaseCount = params.livePurchases.length;
  const averageOrderValueYen =
    purchaseCount > 0
      ? Math.round(liveRevenueTotal / purchaseCount)
      : null;

  return {
    failedJobs,
    averageOrderValueYen,
    purchaseCount,
    purchasingUsers,
    expiringUsers,
    expiringPercoins,
    totalPaidBalance,
    totalPromoBalance,
  };
}

function buildRecentPurchases(params: {
  purchases: CreditTransactionRow[];
  nicknameMap: Map<string, string | null>;
}): DashboardPurchaseRow[] {
  return params.purchases
    .toSorted(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 8)
    .map((purchase) => {
      const { label, yenValue } = resolvePurchasePackage({
        amount: purchase.amount,
        metadata: purchase.metadata,
      });

      return {
        id: purchase.id,
        createdAt: purchase.created_at,
        userId: purchase.user_id ?? "",
        nickname: purchase.user_id
          ? params.nicknameMap.get(purchase.user_id) ?? null
          : null,
        mode: getPurchaseMode(purchase.metadata),
        packageLabel: label,
        percoins: purchase.amount,
        yenValue,
      };
    });
}

function buildAlerts(params: {
  pendingCount: number;
  failedJobs: number;
  expiringUsers: number;
  reports: PostReportRow[];
  activeVisiblePosts: Array<{ user_id: string | null }>;
  now: Date;
}): DashboardAlertRow[] {
  const alerts: DashboardAlertRow[] = [];

  if (params.pendingCount > 0) {
    alerts.push({
      id: "pending-moderation",
      severity: params.pendingCount >= 10 ? "critical" : "warning",
      label: "審査待ちの投稿があります",
      description: `${params.pendingCount.toLocaleString("ja-JP")}件の投稿が確認待ちです。`,
      href: "/admin/moderation",
    });
  }

  const activeUsers = new Set(
    params.activeVisiblePosts
      .map((row) => row.user_id)
      .filter(Boolean) as string[]
  ).size;
  const threshold = Math.max(3, Math.ceil(activeUsers * 0.005));
  const spikeThresholdTime = new Date(
    params.now.getTime() - 10 * 60 * 1000
  );

  const aggregatedReports = params.reports.reduce<
    Record<
      string,
      { weightedScore: number; recentCount: number; latestReportAt: string }
    >
  >((acc, report) => {
    if (!report.post_id) return acc;

    const current = acc[report.post_id] ?? {
      weightedScore: 0,
      recentCount: 0,
      latestReportAt: report.created_at,
    };

    current.weightedScore += Number(report.weight ?? 0);

    if (new Date(report.created_at).getTime() >= spikeThresholdTime.getTime()) {
      current.recentCount += 1;
    }

    if (
      new Date(report.created_at).getTime() >
      new Date(current.latestReportAt).getTime()
    ) {
      current.latestReportAt = report.created_at;
    }

    acc[report.post_id] = current;
    return acc;
  }, {});

  const flaggedReports = Object.values(aggregatedReports).filter(
    (report) =>
      report.recentCount >= 3 || report.weightedScore >= threshold
  );

  if (flaggedReports.length > 0) {
    alerts.push({
      id: "report-threshold",
      severity: "warning",
      label: "通報しきい値に達した投稿があります",
      description: `${flaggedReports.length.toLocaleString("ja-JP")}件の投稿が自動確認ラインに到達しています。`,
      href: "/admin/reports",
    });
  }

  if (params.failedJobs > 0) {
    alerts.push({
      id: "failed-jobs",
      severity: params.failedJobs >= 5 ? "critical" : "warning",
      label: "画像生成ジョブに失敗があります",
      description: `${params.failedJobs.toLocaleString("ja-JP")}件の失敗ジョブを確認してください。`,
      href: "/admin/image-optimization",
    });
  }

  if (params.expiringUsers > 0) {
    alerts.push({
      id: "expiring-batches",
      severity: "info",
      label: "失効間近の無料ペルコインがあります",
      description: `${params.expiringUsers.toLocaleString("ja-JP")}ユーザー分の無料残高が7日以内に失効します。`,
      href: "/admin/credits-summary",
    });
  }

  return alerts.slice(0, 5);
}

export async function getAdminDashboardData(
  range: DashboardRange
): Promise<AdminDashboardData> {
  const ga4Promise = getGa4DashboardData(range);
  const supabase = createAdminClient();
  const { currentStart, previousStart, now, currentStartIso, previousStartIso, nowIso } =
    getRangeBounds(range);

  const expiringCutoffIso = new Date(
    now.getTime() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const activeThresholdIso = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    profilesResult,
    generatedResult,
    pendingResult,
    transactionsResult,
    jobsResult,
    balancesResult,
    expiringResult,
    reportsResult,
    activeVisiblePostsResult,
    ga4,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, nickname, created_at")
      .gte("created_at", previousStartIso)
      .lte("created_at", nowIso),
    supabase
      .from("generated_images")
      .select("user_id, created_at, is_posted, moderation_status, model")
      .gte("created_at", previousStartIso)
      .lte("created_at", nowIso),
    supabase
      .from("generated_images")
      .select("id", { count: "exact", head: true })
      .eq("is_posted", true)
      .eq("moderation_status", "pending"),
    supabase
      .from("credit_transactions")
      .select("id, user_id, amount, transaction_type, metadata, created_at")
      .gte("created_at", previousStartIso)
      .lte("created_at", nowIso),
    supabase
      .from("image_jobs")
      .select("id, status, created_at")
      .gte("created_at", currentStartIso)
      .lte("created_at", nowIso),
    supabase.from("user_credits").select("user_id, balance, paid_balance"),
    supabase
      .from("free_percoin_batches")
      .select("user_id, remaining_amount, expire_at")
      .gt("remaining_amount", 0)
      .gte("expire_at", nowIso)
      .lte("expire_at", expiringCutoffIso),
    supabase
      .from("post_reports")
      .select("post_id, weight, created_at"),
    supabase
      .from("generated_images")
      .select("user_id")
      .eq("is_posted", true)
      .eq("moderation_status", "visible")
      .not("user_id", "is", null)
      .gte("posted_at", activeThresholdIso),
    ga4Promise,
  ]);

  if (profilesResult.error) console.error("Dashboard profiles fetch error:", profilesResult.error);
  if (generatedResult.error) console.error("Dashboard generated fetch error:", generatedResult.error);
  if (pendingResult.error) console.error("Dashboard pending fetch error:", pendingResult.error);
  if (transactionsResult.error) console.error("Dashboard transactions fetch error:", transactionsResult.error);
  if (jobsResult.error) console.error("Dashboard jobs fetch error:", jobsResult.error);
  if (balancesResult.error) console.error("Dashboard balances fetch error:", balancesResult.error);
  if (expiringResult.error) console.error("Dashboard expiring fetch error:", expiringResult.error);
  if (reportsResult.error) console.error("Dashboard reports fetch error:", reportsResult.error);
  if (activeVisiblePostsResult.error) console.error("Dashboard active visible fetch error:", activeVisiblePostsResult.error);

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const generatedImages = (generatedResult.data ?? []) as GeneratedImageRow[];
  const transactions = (transactionsResult.data ?? []) as CreditTransactionRow[];
  const jobs = (jobsResult.data ?? []) as ImageJobRow[];
  const balances = (balancesResult.data ?? []) as CreditBalanceRow[];
  const expiringBatches = (expiringResult.data ?? []) as FreePercoinBatchRow[];
  const reports = (reportsResult.data ?? []) as PostReportRow[];
  const activeVisiblePosts = (activeVisiblePostsResult.data ?? []) as Array<{
    user_id: string | null;
  }>;
  const pendingCount = pendingResult.count ?? 0;

  const currentProfiles = profiles.filter((profile) =>
    isWithinDateRange(profile.created_at, currentStart, now)
  );
  const previousProfiles = profiles.filter((profile) =>
    isWithinDateRange(profile.created_at, previousStart, currentStart)
  );

  const currentGeneratedImages = generatedImages.filter((generation) =>
    isWithinDateRange(generation.created_at, currentStart, now)
  );
  const previousGeneratedImages = generatedImages.filter((generation) =>
    isWithinDateRange(generation.created_at, previousStart, currentStart)
  );

  const purchaseTransactions = transactions.filter(
    (transaction) => transaction.transaction_type === "purchase"
  );
  const currentPurchases = purchaseTransactions.filter((purchase) =>
    isWithinDateRange(purchase.created_at, currentStart, now)
  );
  const previousPurchases = purchaseTransactions.filter((purchase) =>
    isWithinDateRange(purchase.created_at, previousStart, currentStart)
  );

  const currentLivePurchases = currentPurchases.filter(
    (purchase) => getPurchaseMode(purchase.metadata) === "live"
  );
  const previousLivePurchases = previousPurchases.filter(
    (purchase) => getPurchaseMode(purchase.metadata) === "live"
  );

  const currentLiveRevenue = currentLivePurchases.reduce((sum, purchase) => {
    const { yenValue } = resolvePurchasePackage({
      amount: purchase.amount,
      metadata: purchase.metadata,
    });
    return sum + (yenValue ?? 0);
  }, 0);
  const previousLiveRevenue = previousLivePurchases.reduce((sum, purchase) => {
    const { yenValue } = resolvePurchasePackage({
      amount: purchase.amount,
      metadata: purchase.metadata,
    });
    return sum + (yenValue ?? 0);
  }, 0);

  const currentPostedCount = currentGeneratedImages.filter(
    (generation) => generation.is_posted
  ).length;
  const postingRate =
    currentGeneratedImages.length > 0
      ? Number(
          ((currentPostedCount / currentGeneratedImages.length) * 100).toFixed(1)
        )
      : 0;

  const kpis: AdminDashboardKpi[] = [
    createKpi({
      key: "signups",
      label: "新規登録数",
      current: currentProfiles.length,
      previous: previousProfiles.length,
      subtext: `前期間 ${formatInteger(previousProfiles.length)}件`,
    }),
    createKpi({
      key: "generations",
      label: "生成完了数",
      current: currentGeneratedImages.length,
      previous: previousGeneratedImages.length,
      subtext: `投稿率 ${postingRate}%`,
    }),
    createKpi({
      key: "liveRevenue",
      label: "売上",
      current: currentLiveRevenue,
      previous: previousLiveRevenue,
      formatValue: formatYen,
      subtext: `購入 ${formatInteger(currentLivePurchases.length)}件`,
    }),
    {
      key: "pendingModeration",
      label: "審査待ち件数",
      value: formatInteger(pendingCount),
      deltaPct: null,
      deltaDirection: "flat",
      subtext: "現在の確認待ち投稿",
    },
  ];

  const trend = buildTrend({
    profiles: currentProfiles,
    generations: currentGeneratedImages,
    currentStart,
    now,
  });
  const revenueTrend = buildRevenueTrend({
    livePurchases: currentLivePurchases,
    currentStart,
    now,
  });
  const funnel = buildFunnel({
    signups: currentProfiles,
    generations: currentGeneratedImages,
    purchases: currentPurchases,
  });
  const modelMix = buildModelMix(currentGeneratedImages);
  const opsSummary = buildOpsSummary({
    jobs,
    livePurchases: currentLivePurchases,
    balances,
    expiringBatches,
  });

  const recentPurchaseUserIds = Array.from(
    new Set(
      currentPurchases
        .map((purchase) => purchase.user_id)
        .filter(Boolean) as string[]
    )
  );
  const purchaseProfilesResult =
    recentPurchaseUserIds.length > 0
      ? await supabase
          .from("profiles")
          .select("user_id, nickname")
          .in("user_id", recentPurchaseUserIds)
      : { data: [], error: null };

  if (purchaseProfilesResult.error) {
    console.error(
      "Dashboard purchase profiles fetch error:",
      purchaseProfilesResult.error
    );
  }

  const purchaseNicknameMap = new Map<string, string | null>(
    ((purchaseProfilesResult.data ?? []) as Array<{
      user_id: string;
      nickname: string | null;
    }>).map((profile) => [profile.user_id, profile.nickname ?? null] as const)
  );

  const recentPurchases = buildRecentPurchases({
    purchases: currentPurchases,
    nicknameMap: purchaseNicknameMap,
  });
  const alerts = buildAlerts({
    pendingCount,
    failedJobs: opsSummary.failedJobs,
    expiringUsers: opsSummary.expiringUsers,
    reports,
    activeVisiblePosts,
    now,
  });

  return {
    range,
    updatedAt: now.toISOString(),
    kpis,
    ga4,
    trend,
    revenueTrend,
    opsSummary,
    funnel,
    modelMix,
    recentPurchases,
    alerts,
    quickActions: adminQuickActionItems.map((item) => ({
      label: item.label,
      href: item.path,
      description: item.description,
      iconKey: item.iconKey,
    })),
  };
}
