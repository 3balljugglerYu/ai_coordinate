import { PERCOIN_PACKAGES } from "@/features/credits/percoin-packages";
import { getPercoinsFromPriceId } from "@/features/credits/lib/stripe-price-mapping";

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
