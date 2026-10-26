import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPercoinBalance, type PercoinBalance } from "./build-percoin-balance";
import { buildRevenueTree, type RevenueTree } from "./build-revenue-tree";
import { buildWeeklyAnswer, type WeeklyAnswer } from "./build-weekly-answer";
import { getChartRange } from "./chart-range";
import { getRangeBounds, toJstDateKey, type DashboardRange } from "./dashboard-range";
import { fetchAllRows } from "./fetch-all-rows";
import { getOperatorUserIds } from "./get-operator-user-ids";
import {
  LOW_RUNWAY_LIST_LIMIT,
  LOW_RUNWAY_MAX_DAYS,
  type GrowthActiveUsersRow,
  type GrowthPayment,
  type GrowthTimelineEvent,
  type PercoinConsumerSummaryRow,
  type PercoinDailyFlowRow,
  type PercoinGrantRow,
  type PercoinLowRunwayRow,
  type PercoinUsageRow,
} from "./growth-overview-types";
import { excludeOperatorRows } from "./operator-exclusion";
import { resolveTransactionRevenue } from "./purchase-value";
import { isRevenueTransaction } from "./revenue-transaction";
import { listTimelineEvents } from "./timeline-event-repository";

/**
 * 概要(①今週の答え・②売上のツリー・③ペルコインの釣り合い)の取得。
 *
 * ## 失敗したとき(ADR-003)
 *
 * どれか1つでも取れなければ、数字は1つも出さずに `{ status: "error" }` を返す。
 * 0 は「0だった」と読めてしまう(#579)。①は②③の数で判断するので、
 * 欠けた数での判断も出さない。throw しないのは、「すべて」タブの一番上が
 * 落ちると、ほかのカードまで見えなくなるため。
 *
 * ## 除く人
 *
 * `getOperatorUserIds({ strict: true })`。除く一覧を読めなければ失敗にする
 * (内部アカウントがまざった数を、正しい数のように見せないため)。
 */

export interface GrowthOverviewData {
  rangeStart: string;
  rangeEnd: string;
  excludedUserCount: number;
  tree: RevenueTree;
  balance: PercoinBalance;
  answer: WeeklyAnswer;
}

export type GrowthOverviewResult =
  | { status: "ok"; data: GrowthOverviewData }
  | { status: "error"; failed: string[] };

interface PaymentRow {
  id: string;
  user_id: string | null;
  amount: number;
  transaction_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

type RpcResult<T> = { data: T | null; error: { message: string } | null };

class OverviewFetchError extends Error {
  constructor(readonly label: string, cause: string) {
    super(`${label}: ${cause}`);
  }
}

async function rpc<T>(label: string, call: PromiseLike<RpcResult<T>>): Promise<T> {
  const { data, error } = await call;
  if (error) throw new OverviewFetchError(label, error.message);
  if (data === null) throw new OverviewFetchError(label, "結果がありません");
  return data;
}

/** 1行を返す RPC。行が無ければ失敗にする(0 で埋めない)。 */
async function rpcSingle<T>(label: string, call: PromiseLike<RpcResult<T[]>>): Promise<T> {
  const rows = await rpc(label, call);
  const row = rows[0];
  if (!row) throw new OverviewFetchError(label, "行がありません");
  return row;
}

function toPayments(
  rows: PaymentRow[],
  from: Date,
  to: Date,
  userCreatedAt: Map<string, string>,
): GrowthPayment[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  return rows.flatMap((row) => {
    const at = new Date(row.created_at).getTime();
    if (!row.user_id || at < fromMs || at >= toMs) return [];
    const { yenValue } = resolveTransactionRevenue({
      amount: row.amount,
      transactionType: row.transaction_type,
      metadata: row.metadata,
    });
    const createdAt = userCreatedAt.get(row.user_id);
    return [
      {
        userId: row.user_id,
        yen: yenValue ?? 0,
        isNewUser: createdAt !== undefined && new Date(createdAt).getTime() >= fromMs,
      },
    ];
  });
}

async function fetchPayments(
  supabase: SupabaseClient,
  from: Date,
  to: Date,
): Promise<PaymentRow[]> {
  const { data, error } = await fetchAllRows<PaymentRow>((cursor, size) => {
    let query = supabase
      .from("credit_transactions")
      .select("id, user_id, amount, transaction_type, metadata, created_at")
      .in("transaction_type", ["purchase", "subscription"])
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString());
    if (cursor) query = query.gt("id", cursor);
    return query.order("id", { ascending: true }).limit(size);
  });
  if (error) throw new OverviewFetchError("支払い", error.message);
  return data ?? [];
}

async function fetchUserCreatedAt(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const chunks: string[][] = [];
  for (let i = 0; i < userIds.length; i += 200) {
    chunks.push(userIds.slice(i, i + 200));
  }
  // 200人ずつに分けて、同時に引く
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase.from("profiles").select("user_id, created_at").in("user_id", chunk),
    ),
  );
  const map = new Map<string, string>();
  for (const { data, error } of results) {
    if (error) throw new OverviewFetchError("課金した人の登録日", error.message);
    for (const row of (data ?? []) as Array<{ user_id: string; created_at: string }>) {
      map.set(row.user_id, row.created_at);
    }
  }
  return map;
}

export async function getGrowthOverview(
  range: DashboardRange,
  now = new Date(),
): Promise<GrowthOverviewResult> {
  try {
    const { currentStart, previousStart } = getRangeBounds(range, now);
    const chart = getChartRange(range, now);
    const supabase = createAdminClient();

    let excluded: string[];
    try {
      excluded = await getOperatorUserIds({ strict: true });
    } catch (error) {
      throw new OverviewFetchError(
        "集計から除く人",
        error instanceof Error ? error.message : String(error),
      );
    }

    const cur = { p_start: currentStart.toISOString(), p_end: now.toISOString(), p_exclude_user_ids: excluded };
    const prev = { p_start: previousStart.toISOString(), p_end: currentStart.toISOString(), p_exclude_user_ids: excluded };
    const chartArgs = { p_start: chart.start.toISOString(), p_end: chart.end.toISOString(), p_exclude_user_ids: excluded };

    const results = await Promise.allSettled([
      rpcSingle<GrowthActiveUsersRow>("使っている人(今)", supabase.rpc("get_growth_active_users", cur)),
      rpcSingle<GrowthActiveUsersRow>("使っている人(前)", supabase.rpc("get_growth_active_users", prev)),
      rpc<PercoinDailyFlowRow[]>("日ごとの出入り(今)", supabase.rpc("get_percoin_daily_flow", cur)),
      rpc<PercoinDailyFlowRow[]>("日ごとの出入り(前)", supabase.rpc("get_percoin_daily_flow", prev)),
      /*
        7d・30d・90d のグラフの日は、今の期間の日ごとの出入りに丸ごと入っている
        (グラフは日本時間の 0:00 から始まり、今の期間はそれより前から始まるため)。
        別に取るのは、グラフが今の期間より長い 24h のときだけ。
      */
      range === "24h"
        ? rpc<PercoinDailyFlowRow[]>(
            "日ごとの出入り(グラフ)",
            supabase.rpc("get_percoin_daily_flow", chartArgs),
          )
        : Promise.resolve<PercoinDailyFlowRow[] | null>(null),
      rpc<PercoinGrantRow[]>(
        "配布の内訳",
        supabase.rpc("get_percoin_grant_breakdown", cur),
      ),
      rpc<PercoinUsageRow[]>("使い道", supabase.rpc("get_percoin_usage_breakdown", cur)),
      rpcSingle<PercoinConsumerSummaryRow>(
        "消費した人のまとめ",
        supabase.rpc("get_percoin_consumer_summary", { ...cur, p_top_n: 10 }),
      ),
      rpc<PercoinLowRunwayRow[]>(
        "残りの日数が少ない人",
        supabase.rpc("get_percoin_low_runway_users", {
          ...cur,
          p_max_days: LOW_RUNWAY_MAX_DAYS,
          p_limit: LOW_RUNWAY_LIST_LIMIT + 1,
        }),
      ),
      fetchPayments(supabase, previousStart, now),
      listTimelineEvents({
        from: toJstDateKey(chart.start),
        to: toJstDateKey(chart.end),
      }).catch((error: unknown) => {
        throw new OverviewFetchError(
          "出来事の印",
          error instanceof Error ? error.message : String(error),
        );
      }),
    ]);

    const failed = results.flatMap((r) =>
      r.status === "rejected"
        ? [r.reason instanceof OverviewFetchError ? r.reason.label : "不明"]
        : [],
    );
    if (failed.length > 0) {
      for (const r of results) {
        if (r.status === "rejected") console.error("[growth overview]", r.reason);
      }
      return { status: "error", failed };
    }

    const values = results.map((r) => (r as PromiseFulfilledResult<unknown>).value);
    const [
      activeCur,
      activePrev,
      flowCur,
      flowPrev,
      flowChart,
      grants,
      usage,
      summary,
      lowRunway,
      paymentRows,
      events,
    ] = values as [
      GrowthActiveUsersRow,
      GrowthActiveUsersRow,
      PercoinDailyFlowRow[],
      PercoinDailyFlowRow[],
      PercoinDailyFlowRow[] | null,
      PercoinGrantRow[],
      PercoinUsageRow[],
      PercoinConsumerSummaryRow,
      PercoinLowRunwayRow[],
      PaymentRow[],
      Awaited<ReturnType<typeof listTimelineEvents>>,
    ];

    const revenueRows = excludeOperatorRows(paymentRows, excluded).filter(isRevenueTransaction);
    const payerIds = Array.from(
      new Set(revenueRows.flatMap((row) => (row.user_id ? [row.user_id] : []))),
    );
    const createdAt = await fetchUserCreatedAt(supabase, payerIds);

    const tree = buildRevenueTree({
      current: { active: activeCur, payments: toPayments(revenueRows, currentStart, now, createdAt) },
      previous: {
        active: activePrev,
        payments: toPayments(revenueRows, previousStart, currentStart, createdAt),
      },
    });

    const timeline: GrowthTimelineEvent[] = events.map((e) => ({
      eventDate: e.eventDate,
      kind: e.kind,
      title: e.title,
    }));

    const balance = buildPercoinBalance({
      currentFlow: flowCur,
      previousFlow: flowPrev,
      chartFlow:
        flowChart ??
        flowCur.filter((row) => String(row.day).slice(0, 10) >= toJstDateKey(chart.start)),
      grants,
      usage,
      summary,
      lowRunway,
      lowRunwayLimit: LOW_RUNWAY_LIST_LIMIT,
      events: timeline,
    });

    return {
      status: "ok",
      data: {
        rangeStart: currentStart.toISOString(),
        rangeEnd: now.toISOString(),
        excludedUserCount: excluded.length,
        tree,
        balance,
        answer: buildWeeklyAnswer({ tree, balance }),
      },
    };
  } catch (error) {
    console.error("[growth overview]", error);
    return {
      status: "error",
      failed: [error instanceof OverviewFetchError ? error.label : "不明"],
    };
  }
}
