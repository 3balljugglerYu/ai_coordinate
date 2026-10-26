import { labelForGrantSource } from "./build-percoin-analytics";
import { ratePct } from "./build-revenue-tree";
import { toNumber as n } from "./growth-format";
import type {
  GrowthTimelineEvent,
  PercoinConsumerSummaryRow,
  PercoinDailyFlowRow,
  PercoinGrantRow,
  PercoinLowRunwayRow,
  PercoinUsageRow,
} from "./growth-overview-types";

/**
 * ペルコインの釣り合い(純関数)。
 *
 * 「配った量(無料)」と「使った量(正味 = 消費 − 失敗の返金)」を並べ、
 * 買う理由が生まれているか(足りなくなる人がいるか)を見る。
 */

/** 無料の配布に数えない付与の種類(お金で買ったもの・返金)。 */
const NON_FREE_SOURCES = new Set(["purchase", "subscription", "refund"]);

const USE_LABELS: Record<string, string> = {
  free: "フリー生成（create）",
  one_tap_style: "ワンタップ（Persta ORIGINAL）",
  failed_job: "失敗した生成（返金済み）",
  gacha_split_api: "ガチャの分割",
  name_input_create_api: "文字入力",
  other: "そのほか",
};

export function labelForUseKey(key: string): string {
  return USE_LABELS[key] ?? key;
}

export interface PercoinAmountItem {
  key: string;
  label: string;
  amount: number;
  users?: number;
}

export interface PercoinFlowTotals {
  freeGranted: number;
  consumed: number;
  refunded: number;
  /** 消費 − 返金 */
  netConsumed: number;
  purchased: number;
}

export interface PercoinBalance {
  current: PercoinFlowTotals;
  previous: PercoinFlowTotals;
  /** 配った量 ÷ 使った量(正味)。使った量が0なら null。1以上なら「配る方が多い」 */
  freeToNetRatio: number | null;
  previousFreeToNetRatio: number | null;
  freeBySource: PercoinAmountItem[];
  /** 使い道ごとの正味(消費 − 返金)。失敗した生成は正味がほぼ0になる */
  usageByKind: PercoinAmountItem[];
  /** 使った量(正味)のうち有料のペルコインの分 */
  paidNetConsumed: number;
  topConsumers: {
    count: number;
    consumedNet: number;
    freeGranted: number;
    /** 上位の人が使った量のうち、全体に占める割合(%) */
    shareOfTotalPct: number | null;
    /** 上位の人が使った分に対して、無料でもらった量の割合(%・100を超えうる) */
    selfFundedPct: number | null;
  };
  consumerCount: number;
  runway: Array<{ key: string; label: string; users: number; low: boolean }>;
  nonPositiveCount: number;
  lowRunwayUsers: Array<{
    userId: string;
    nickname: string | null;
    balance: number;
    daysLeft: number;
  }>;
  lowRunwayHasMore: boolean;
  daily: Array<{
    day: string;
    freeGranted: number;
    netConsumed: number;
    purchased: number;
  }>;
  events: GrowthTimelineEvent[];
}

export function sumDailyFlow(rows: PercoinDailyFlowRow[]): PercoinFlowTotals {
  const totals = rows.reduce(
    (acc, row) => ({
      freeGranted: acc.freeGranted + n(row.free_granted),
      consumed: acc.consumed + n(row.consumed),
      refunded: acc.refunded + n(row.refunded),
      purchased: acc.purchased + n(row.purchased),
    }),
    { freeGranted: 0, consumed: 0, refunded: 0, purchased: 0 },
  );
  return { ...totals, netConsumed: totals.consumed - totals.refunded };
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

export function buildPercoinBalance(input: {
  currentFlow: PercoinDailyFlowRow[];
  previousFlow: PercoinDailyFlowRow[];
  chartFlow: PercoinDailyFlowRow[];
  grants: PercoinGrantRow[];
  usage: PercoinUsageRow[];
  summary: PercoinConsumerSummaryRow;
  lowRunway: PercoinLowRunwayRow[];
  lowRunwayLimit: number;
  events: GrowthTimelineEvent[];
}): PercoinBalance {
  const current = sumDailyFlow(input.currentFlow);
  const previous = sumDailyFlow(input.previousFlow);

  const freeBySource = input.grants
    .filter((row) => !NON_FREE_SOURCES.has(row.source))
    .map((row) => ({
      key: row.source,
      label: labelForGrantSource(row.source),
      amount: n(row.total_amount),
      users: n(row.user_count),
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const usageByKind = input.usage
    .map((row) => ({
      key: row.use_key,
      label: labelForUseKey(row.use_key),
      amount: n(row.consumed) - n(row.refunded),
    }))
    .filter((item) => item.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const paidNetConsumed = input.usage.reduce(
    (sum, row) => sum + n(row.paid_consumed) - n(row.paid_refunded),
    0,
  );

  const s = input.summary;
  const topConsumedNet = n(s.top_consumed_net);
  const topFreeGranted = n(s.top_free_granted);

  const lowRunwayUsers = input.lowRunway.slice(0, input.lowRunwayLimit).map((row) => ({
    userId: row.user_id,
    nickname: row.nickname,
    balance: n(row.balance),
    daysLeft: n(row.days_left),
  }));

  return {
    current,
    previous,
    freeToNetRatio: ratio(current.freeGranted, current.netConsumed),
    previousFreeToNetRatio: ratio(previous.freeGranted, previous.netConsumed),
    freeBySource,
    usageByKind,
    paidNetConsumed,
    topConsumers: {
      count: n(s.top_count),
      consumedNet: topConsumedNet,
      freeGranted: topFreeGranted,
      shareOfTotalPct: ratePct(topConsumedNet, n(s.total_consumed_net)),
      selfFundedPct: ratePct(topFreeGranted, topConsumedNet),
    },
    consumerCount: n(s.consumer_count),
    runway: [
      { key: "le3", label: "3日以内", users: n(s.runway_le3), low: true },
      { key: "3_7", label: "3〜7日", users: n(s.runway_3_7), low: true },
      { key: "7_30", label: "7〜30日", users: n(s.runway_7_30), low: false },
      { key: "30_90", label: "30〜90日", users: n(s.runway_30_90), low: false },
      { key: "gt90", label: "90日より先", users: n(s.runway_gt90), low: false },
    ],
    nonPositiveCount: n(s.non_positive_count),
    lowRunwayUsers,
    lowRunwayHasMore: input.lowRunway.length > input.lowRunwayLimit,
    daily: input.chartFlow.map((row) => ({
      day: String(row.day).slice(0, 10),
      freeGranted: n(row.free_granted),
      netConsumed: n(row.consumed) - n(row.refunded),
      purchased: n(row.purchased),
    })),
    events: input.events,
  };
}
