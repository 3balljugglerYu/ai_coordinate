import { PERCOIN_PACKAGES } from "@/features/credits/percoin-packages";
import { getPercoinsFromPriceId } from "@/features/credits/lib/stripe-price-mapping";
import type {
  PaidSubscriptionPlan,
  SubscriptionBillingInterval,
} from "@/features/subscription/subscription-config";

type PurchaseMetadata = Record<string, unknown> | null | undefined;

const packagesById = new Map(
  PERCOIN_PACKAGES.map((pkg) => [pkg.id, pkg] as const)
);
const packagesByCredits = new Map(
  PERCOIN_PACKAGES.map((pkg) => [pkg.credits, pkg] as const)
);

function getStringValue(
  metadata: PurchaseMetadata,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function getNumberValue(
  metadata: PurchaseMetadata,
  key: string
): number | null {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getSubscriptionPlan(
  metadata: PurchaseMetadata
): PaidSubscriptionPlan | null {
  const value = getStringValue(metadata, "plan");
  return value === "light" || value === "standard" || value === "premium"
    ? value
    : null;
}

function getSubscriptionBillingInterval(
  metadata: PurchaseMetadata
): SubscriptionBillingInterval | null {
  const value = getStringValue(metadata, "billingInterval");
  return value === "month" || value === "year" ? value : null;
}

export function getPurchaseMode(metadata: PurchaseMetadata): string {
  return getStringValue(metadata, "mode") ?? "unknown";
}

export function resolvePurchasePackage(params: {
  amount: number;
  metadata: PurchaseMetadata;
}) {
  const packageId = getStringValue(params.metadata, "packageId");
  const priceId = getStringValue(params.metadata, "priceId");

  const packageFromId = packageId ? packagesById.get(packageId) : undefined;
  const percoinsFromPriceId = priceId ? getPercoinsFromPriceId(priceId) : null;
  const packageFromPriceId =
    percoinsFromPriceId !== null
      ? packagesByCredits.get(percoinsFromPriceId)
      : undefined;
  const matchedPackage =
    packageFromId ??
    packageFromPriceId ??
    packagesByCredits.get(params.amount);
  const fallbackKey = packageId ?? priceId ?? `amount-${params.amount}`;

  return {
    key: matchedPackage?.id ?? fallbackKey,
    label: matchedPackage?.name ?? `${params.amount.toLocaleString()}ペルコイン`,
    yenValue: matchedPackage?.priceYen ?? null,
  };
}

export function resolveTransactionRevenue(params: {
  amount: number;
  transactionType: string;
  metadata: PurchaseMetadata;
}) {
  const revenueYen = getNumberValue(params.metadata, "revenueYen");

  if (params.transactionType === "purchase") {
    const resolvedPackage = resolvePurchasePackage({
      amount: params.amount,
      metadata: params.metadata,
    });

    return {
      ...resolvedPackage,
      yenValue: revenueYen ?? resolvedPackage.yenValue,
    };
  }

  if (params.transactionType === "subscription") {
    const plan = getSubscriptionPlan(params.metadata);
    const billingInterval = getSubscriptionBillingInterval(params.metadata);
    const label =
      plan && billingInterval
        ? `サブスクリプション ${plan} ${billingInterval === "year" ? "年額" : "月額"}`
        : "サブスクリプション";

    return {
      key:
        plan && billingInterval
          ? `subscription-${plan}-${billingInterval}`
          : "subscription",
      label,
      yenValue: revenueYen,
    };
  }

  return {
    key: params.transactionType,
    label: params.transactionType,
    yenValue: null,
  };
}
