import type { PercoinBalance } from "./build-percoin-balance";
import type { RevenueTree } from "./build-revenue-tree";
import { GROWTH_MIN_SAMPLE } from "./growth-overview-types";
import { formatCount, formatDiff, formatPct as pct } from "./growth-format";

/**
 * 「今週の答え」(純関数・ADR-004)。
 *
 * 直し所を決まりで1つ選び、「効いたかを見る数字」を添える。
 * 配り方や値段をどう変えるかの答えは出さない(それはユーザーが決める)。
 *
 * 決まり(計画 2-3 の順):
 *   1. 使っている人が30人未満 → まだ判断できない
 *   2. 無料で配った量 ≥ 使った量(正味)、かつ配った量が0より多い → ペルコインが足りなくならない
 *      (使った量が0でも、配っていれば当てはまる。全部が返金された期間も同じ)
 *   3. 前の期間も30人以上いて、課金した人の割合が下がった → 課金した人の割合
 *   4. 前の期間も30人以上いて、使っている人が減った → 使っている人
 *   5. どれでもない → 大きな詰まりは見つからない
 */

export type WeeklyFindingKind =
  | "insufficient_sample"
  | "percoin_surplus"
  | "payer_rate_down"
  | "active_users_down"
  | "no_bottleneck";

export interface WeeklyAnswer {
  revenue: {
    headline: string;
    detail: string;
  };
  finding: {
    kind: WeeklyFindingKind;
    title: string;
    detail: string;
    /** 直したあと、効いたかを見る数字 */
    watch: string[];
  };
  /** 判断を出していないこと・その理由 */
  notes: string[];
}

function yen(value: number): string {
  return `${formatCount(value)}円`;
}

export function buildWeeklyAnswer(input: {
  tree: RevenueTree;
  balance: PercoinBalance;
  minSample?: number;
}): WeeklyAnswer {
  const min = input.minSample ?? GROWTH_MIN_SAMPLE;
  const { current, previous } = input.tree;
  const { balance } = input;

  const revenue = {
    headline: `${yen(current.revenueYen)}(前の期間 ${yen(previous.revenueYen)}・${formatDiff(current.revenueYen, previous.revenueYen, "円")})`,
    detail: `新しく登録した人から ${yen(current.newUsers.revenueYen)}(${current.newUsers.payers}人)・前から使っている人から ${yen(current.existingUsers.revenueYen)}(${current.existingUsers.payers}人)`,
  };

  const notes: string[] = [];
  const previousComparable = previous.activeUsers >= min;
  if (!previousComparable) {
    notes.push(
      `前の期間の使っている人が${previous.activeUsers}人(${min}人未満)なので、前の期間とは比べていません`,
    );
  }

  const surplusWatch = [
    `配った量 ÷ 使った量(今 ${balance.freeToNetRatio ?? "—"})`,
    `残りが3日以内の人(今 ${balance.runway.find((r) => r.key === "le3")?.users ?? 0}人)`,
    `課金した人の割合(今 ${pct(current.payerRatePct)})`,
  ];

  if (current.activeUsers < min) {
    return {
      revenue,
      finding: {
        kind: "insufficient_sample",
        title: "まだ判断できません",
        detail: `使っている人が${current.activeUsers}人で、${min}人に届いていません。人数が増えたら判断を出します。`,
        watch: [`使っている人(今 ${current.activeUsers}人)`],
      },
      notes,
    };
  }

  if (
    balance.current.freeGranted > 0 &&
    balance.current.freeGranted >= balance.current.netConsumed
  ) {
    return {
      revenue,
      finding: {
        kind: "percoin_surplus",
        title: "ペルコインが足りなくならない",
        detail: `無料で配った量(${formatCount(balance.current.freeGranted)})が、使った量(正味 ${formatCount(balance.current.netConsumed)})以上です。買う理由が生まれにくい状態です。`,
        watch: surplusWatch,
      },
      notes,
    };
  }

  if (
    previousComparable &&
    current.payerRatePct !== null &&
    previous.payerRatePct !== null &&
    current.payerRatePct < previous.payerRatePct
  ) {
    return {
      revenue,
      finding: {
        kind: "payer_rate_down",
        title: "課金した人の割合が下がった",
        detail: `${pct(previous.payerRatePct)} → ${pct(current.payerRatePct)}(${previous.payers}人 → ${current.payers}人)。`,
        watch: [
          `課金した人の割合(今 ${pct(current.payerRatePct)})`,
          `残りが3日以内の人(今 ${balance.runway.find((r) => r.key === "le3")?.users ?? 0}人)`,
        ],
      },
      notes,
    };
  }

  if (previousComparable && current.activeUsers < previous.activeUsers) {
    return {
      revenue,
      finding: {
        kind: "active_users_down",
        title: "使っている人が減った",
        detail: `${previous.activeUsers}人 → ${current.activeUsers}人。`,
        watch: [
          `使っている人(今 ${current.activeUsers}人)`,
          `新しく登録して使っている人(今 ${current.newUsers.activeUsers}人)`,
        ],
      },
      notes,
    };
  }

  return {
    revenue,
    finding: {
      kind: "no_bottleneck",
      title: "大きな詰まりは見つかりません",
      detail: "使っている人と課金した人の割合は、前の期間から下がっていません。",
      watch: [
        `課金した人の割合(今 ${pct(current.payerRatePct)})`,
        `配った量 ÷ 使った量(今 ${balance.freeToNetRatio ?? "—"})`,
      ],
    },
    notes,
  };
}
