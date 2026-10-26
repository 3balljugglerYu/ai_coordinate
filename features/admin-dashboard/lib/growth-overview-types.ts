/**
 * 概要(売上のツリー・ペルコインの釣り合い・今週の答え)の型。
 * RPC の行の型は supabase/migrations/20261025233400_add_growth_overview_tables_and_rpcs.sql の
 * RETURNS TABLE とそろえる。bigint は JSON では数値で来るが、念のため受け取り側で Number() を通す。
 */

import type { TimelineEventKind } from "./admin-list-validation";
import type { PercoinGrantRow } from "./build-percoin-analytics";

export type { PercoinGrantRow };

/** 判断を出すのに要る人数(分母)。これより少ない段階は「まだ判断できません」。 */
export const GROWTH_MIN_SAMPLE = 30;

/** 残りの日数が少ない人の一覧の上限(+1 で呼んで、続きの有無を知る)。 */
export const LOW_RUNWAY_LIST_LIMIT = 50;
export const LOW_RUNWAY_MAX_DAYS = 3;

export interface GrowthActiveUsersRow {
  active_users: number;
  active_new_users: number;
  active_existing_users: number;
}

export interface PercoinUsageRow {
  use_key: string;
  consumed: number;
  refunded: number;
  paid_consumed: number;
  paid_refunded: number;
  tx_count: number;
}

export interface PercoinDailyFlowRow {
  day: string;
  free_granted: number;
  consumed: number;
  refunded: number;
  purchased: number;
}

export interface PercoinConsumerSummaryRow {
  consumer_count: number;
  total_consumed_net: number;
  top_count: number;
  top_consumed_net: number;
  top_free_granted: number;
  runway_le3: number;
  runway_3_7: number;
  runway_7_30: number;
  runway_30_90: number;
  runway_gt90: number;
  non_positive_count: number;
}

export interface PercoinLowRunwayRow {
  user_id: string;
  nickname: string | null;
  balance: number;
  consumed_net: number;
  days_left: number;
}

/** 売上に数える支払い1件(運営は除いたあと)。 */
export interface GrowthPayment {
  userId: string;
  yen: number;
  /** その期間の中で登録した人か(profiles.created_at >= 期間の始まり) */
  isNewUser: boolean;
}

export interface GrowthTimelineEvent {
  eventDate: string;
  kind: TimelineEventKind;
  title: string;
}
