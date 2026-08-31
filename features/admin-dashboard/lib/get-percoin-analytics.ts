import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRangeBounds, type DashboardRange } from "./dashboard-range";
import { getOperatorUserIds } from "./get-operator-user-ids";
import {
  buildPercoinAnalytics,
  type PercoinAnalytics,
  type PercoinGrantRow,
  type PercoinStreakReachRow,
  type PercoinCheckinReachRow,
  type PercoinBalanceDistributionRow,
} from "./build-percoin-analytics";

/**
 * ペルコインの配布状況をまとめて取る（ADR: 集計は SQL 側）。
 *
 * 行を引いてアプリ側で数えると PostgREST の 1,000行上限に当たり、
 * エラーも出さずに数字が過小になる（#579 / #580）。credit_transactions は
 * 9,154行あって増え続けるので、最初から RPC に寄せている。
 *
 * 前期は「同じ長さのひとつ前の期間」。額を下げた後に、配布総額と
 * 継続率がどう動いたかを並べて見るための比較軸。
 */
export async function getPercoinAnalytics(
  range: DashboardRange
): Promise<PercoinAnalytics> {
  const supabase = createAdminClient();
  const { currentStart, previousStart, now } = getRangeBounds(range);
  const operatorUserIds = await getOperatorUserIds();

  const [
    current,
    previous,
    streak,
    previousStreak,
    checkin,
    previousCheckin,
    distribution,
  ] = await Promise.all([
      supabase.rpc("get_percoin_grant_breakdown", {
        p_start: currentStart.toISOString(),
        p_end: now.toISOString(),
        p_exclude_user_ids: operatorUserIds,
      }),
      supabase.rpc("get_percoin_grant_breakdown", {
        p_start: previousStart.toISOString(),
        p_end: currentStart.toISOString(),
        p_exclude_user_ids: operatorUserIds,
      }),
      supabase.rpc("get_percoin_streak_reach", {
        p_start: currentStart.toISOString(),
        p_end: now.toISOString(),
        p_max_day: 14,
        p_exclude_user_ids: operatorUserIds,
      }),
      supabase.rpc("get_percoin_streak_reach", {
        p_start: previousStart.toISOString(),
        p_end: currentStart.toISOString(),
        p_max_day: 14,
        p_exclude_user_ids: operatorUserIds,
      }),
      supabase.rpc("get_percoin_checkin_reach", {
        p_start: currentStart.toISOString(),
        p_end: now.toISOString(),
        p_exclude_user_ids: operatorUserIds,
      }),
      supabase.rpc("get_percoin_checkin_reach", {
        p_start: previousStart.toISOString(),
        p_end: currentStart.toISOString(),
        p_exclude_user_ids: operatorUserIds,
      }),
      supabase.rpc("get_percoin_balance_distribution", {
        p_exclude_user_ids: operatorUserIds,
      }),
    ]);

  /*
    集計 RPC が落ちたら 0 の画面を出さずに throw する。
    0 は「0だった」という嘘の数字として読めてしまう（#579 / #580 の教訓）。
    /admin の error boundary が受ける。
  */
  const results = [
    ["配布内訳(当期)", current],
    ["配布内訳(前期)", previous],
    ["連続ログイン到達(当期)", streak],
    ["連続ログイン到達(前期)", previousStreak],
    ["チェックイン到達(当期)", checkin],
    ["チェックイン到達(前期)", previousCheckin],
    ["保有分布", distribution],
  ] as const;
  for (const [label, result] of results) {
    if (result.error) {
      throw new Error(
        `ペルコイン分析: ${label} の取得に失敗しました: ${result.error.message}`
      );
    }
  }

  return buildPercoinAnalytics({
    currentGrants: (current.data ?? []) as PercoinGrantRow[],
    previousGrants: (previous.data ?? []) as PercoinGrantRow[],
    streakReach: (streak.data ?? []) as PercoinStreakReachRow[],
    previousStreakReach: (previousStreak.data ?? []) as PercoinStreakReachRow[],
    checkinReach: ((checkin.data ?? [])[0] ?? null) as PercoinCheckinReachRow | null,
    previousCheckinReach: ((previousCheckin.data ?? [])[0] ??
      null) as PercoinCheckinReachRow | null,
    distribution: ((distribution.data ?? [])[0] ??
      null) as PercoinBalanceDistributionRow | null,
    operatorExcludedCount: operatorUserIds.length,
  });
}
