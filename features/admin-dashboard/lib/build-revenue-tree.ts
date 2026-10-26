import type { GrowthActiveUsersRow, GrowthPayment } from "./growth-overview-types";
import { toNumber } from "./growth-format";

/**
 * 売上のツリー(純関数)。
 *
 *   売上 = 使っている人 × 課金した人の割合 × 課金した人1人あたり
 *
 * 「使っている人」は get_growth_active_users(期間内に生成に成功した人か、
 * 本番の支払いをした人)。課金した人は必ずこの中に入るので、割合は100%を超えない。
 * 新しく登録した人(期間内に登録)と、前から使っている人に分ける。
 */

export interface RevenueBranch {
  activeUsers: number;
  payers: number;
  revenueYen: number;
  /** 課金した人の割合(%・小数1桁)。使っている人が0なら null */
  payerRatePct: number | null;
}

export interface RevenueTreePeriod {
  revenueYen: number;
  activeUsers: number;
  payers: number;
  payerRatePct: number | null;
  /** 課金した人1人あたり(円)。課金した人が0なら null */
  revenuePerPayerYen: number | null;
  newUsers: RevenueBranch;
  existingUsers: RevenueBranch;
}

export interface RevenueTree {
  current: RevenueTreePeriod;
  previous: RevenueTreePeriod;
}

export function ratePct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function branch(activeUsers: number, payments: GrowthPayment[]): RevenueBranch {
  const payers = new Set(payments.map((p) => p.userId)).size;
  const revenueYen = payments.reduce((sum, p) => sum + p.yen, 0);
  return {
    activeUsers,
    payers,
    revenueYen,
    payerRatePct: ratePct(payers, activeUsers),
  };
}

export function buildRevenueTreePeriod(
  active: GrowthActiveUsersRow,
  payments: GrowthPayment[],
): RevenueTreePeriod {
  const activeUsers = toNumber(active.active_users);
  const newUsers = branch(
    toNumber(active.active_new_users),
    payments.filter((p) => p.isNewUser),
  );
  const existingUsers = branch(
    toNumber(active.active_existing_users),
    payments.filter((p) => !p.isNewUser),
  );
  const payers = new Set(payments.map((p) => p.userId)).size;
  const revenueYen = payments.reduce((sum, p) => sum + p.yen, 0);

  return {
    revenueYen,
    activeUsers,
    payers,
    payerRatePct: ratePct(payers, activeUsers),
    revenuePerPayerYen: payers > 0 ? Math.round(revenueYen / payers) : null,
    newUsers,
    existingUsers,
  };
}

export function buildRevenueTree(input: {
  current: { active: GrowthActiveUsersRow; payments: GrowthPayment[] };
  previous: { active: GrowthActiveUsersRow; payments: GrowthPayment[] };
}): RevenueTree {
  return {
    current: buildRevenueTreePeriod(input.current.active, input.current.payments),
    previous: buildRevenueTreePeriod(input.previous.active, input.previous.payments),
  };
}
