export const ADMIN_PERCOIN_BALANCE_TYPES = [
  "period_limited",
  "unlimited",
] as const;

export type AdminPercoinBalanceType =
  (typeof ADMIN_PERCOIN_BALANCE_TYPES)[number];

export const DEFAULT_ADMIN_PERCOIN_BALANCE_TYPE: AdminPercoinBalanceType =
  "period_limited";

export const ADMIN_PERCOIN_BALANCE_TYPE_LABELS: Record<
  AdminPercoinBalanceType,
  string
> = {
  period_limited: "期間限定",
  unlimited: "無期限",
};

export const ADMIN_PERCOIN_BALANCE_TYPE_DESCRIPTIONS: Record<
  AdminPercoinBalanceType,
  string
> = {
  period_limited: "付与月 + 6か月後の月末 23:59:59 JST に失効します。",
  unlimited: "失効しない管理者付与ペルコインとして扱われます。",
};

export function isAdminPercoinBalanceType(
  value: unknown
): value is AdminPercoinBalanceType {
  return (
    typeof value === "string" &&
    ADMIN_PERCOIN_BALANCE_TYPES.includes(
      value as AdminPercoinBalanceType
    )
  );
}

export function getAdminPercoinBalanceTypeLabel(
  value: AdminPercoinBalanceType
): string {
  return ADMIN_PERCOIN_BALANCE_TYPE_LABELS[value];
}
