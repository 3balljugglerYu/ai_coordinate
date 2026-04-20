import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import { cacheLife, cacheTag } from "next/cache";
import { Card } from "@/components/ui/card";
import { ROUTES } from "@/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/i18n/config";
import { getPercoinBalanceBreakdownServer } from "../lib/server-api";

interface CachedMyPagePercoinBalanceProps {
  userId: string;
  locale: Locale;
  copy: {
    balanceLabel: string;
    balancePaid: string;
    balanceUnlimitedBonus: string;
    balancePeriodLimited: string;
    percoinUnit: string;
    buy: string;
    transactionHistoryLink: string;
  };
}

export async function CachedMyPagePercoinBalance({
  userId,
  locale,
  copy,
}: CachedMyPagePercoinBalanceProps) {
  "use cache";
  cacheTag(`my-page-${userId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const percoinBalanceBreakdown = await getPercoinBalanceBreakdownServer(
    userId,
    supabase
  );
  const formatter = new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US");
  const balanceDetails = [
    { label: copy.balancePaid, value: percoinBalanceBreakdown.paid },
    {
      label: copy.balanceUnlimitedBonus,
      value: percoinBalanceBreakdown.unlimited_bonus,
    },
    {
      label: copy.balancePeriodLimited,
      value: percoinBalanceBreakdown.period_limited,
    },
  ].filter((item) => item.value > 0);

  return (
    <div className="mb-6">
      <Link href={`${ROUTES.CREDITS_PURCHASE}?tab=subscription`}>
        <Card className="cursor-pointer p-4 transition-opacity hover:opacity-90">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
                <Image
                  src="/percoin.png"
                  alt={copy.percoinUnit}
                  width={48}
                  height={48}
                  className="object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-gray-600">{copy.balanceLabel}</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatter.format(percoinBalanceBreakdown.total)} {copy.percoinUnit}
                </p>
                {balanceDetails.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {balanceDetails
                      .map(
                        (item) => `${item.label}: ${formatter.format(item.value)}`
                      )
                      .join(" / ")}
                  </p>
                )}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-600">
              <Plus className="h-4 w-4" />
              {copy.buy}
            </span>
          </div>
        </Card>
      </Link>
      <div className="mt-2 flex justify-end pr-4">
        <Link
          href={ROUTES.MY_PAGE_CREDITS}
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          {copy.transactionHistoryLink}
        </Link>
      </div>
    </div>
  );
}
