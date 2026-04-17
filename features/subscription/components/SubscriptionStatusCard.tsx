"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard, LoaderCircle, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubscriptionBadge } from "@/features/subscription/components/SubscriptionBadge";
import {
  getSubscriptionMonthlyPercoins,
  isActiveSubscriptionStatus,
  type SubscriptionPlan,
} from "@/features/subscription/subscription-config";
import type { UserSubscription } from "@/features/subscription/lib/server-api";

interface SubscriptionStatusCardProps {
  subscription: UserSubscription | null;
}

export function SubscriptionStatusCard({
  subscription,
}: SubscriptionStatusCardProps) {
  const t = useTranslations("subscription");
  const locale = useLocale();
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = subscription?.plan ?? "free";
  const isActive =
    subscription != null && isActiveSubscriptionStatus(subscription.status);
  const formatter = new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const currentPeriodEnd = subscription?.current_period_end
    ? formatter.format(new Date(subscription.current_period_end))
    : null;
  const cancelAt = subscription?.cancel_at
    ? formatter.format(new Date(subscription.cancel_at))
    : null;
  const pendingCancellationDate =
    subscription?.cancel_at_period_end || subscription?.cancel_at
      ? cancelAt ?? currentPeriodEnd
      : null;

  const handleOpenPortal = async () => {
    try {
      setIsLoadingPortal(true);
      setError(null);

      const response = await fetch("/api/subscription/portal", {
        method: "POST",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.url) {
        throw new Error(data?.error || t("portalError"));
      }

      window.location.href = data.url;
    } catch (portalError) {
      setError(
        portalError instanceof Error ? portalError.message : t("portalError")
      );
    } finally {
      setIsLoadingPortal(false);
    }
  };

  if (!isActive) {
    return (
      <Card className="mb-6 border-dashed border-gray-300 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{t("statusTitle")}</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900">
              {t("inactiveTitle")}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {t("inactiveDescription")}
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/pricing">
              <Sparkles className="h-4 w-4" />
              {t("joinAction")}
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-500">{t("statusTitle")}</p>
            <SubscriptionBadge plan={plan} />
          </div>
          <h2 className="mt-1 text-xl font-semibold text-gray-900">
            {t(`plan.${plan}`)}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {t("monthlyPercoins", {
              amount: getSubscriptionMonthlyPercoins(plan as SubscriptionPlan),
            })}
          </p>
          {pendingCancellationDate ? (
            <p className="mt-1 text-sm text-amber-700">
              {t("cancelAtPeriodEnd", { date: pendingCancellationDate })}
            </p>
          ) : currentPeriodEnd ? (
            <p className="mt-1 text-sm text-gray-600">
              {t("renewalDate", { date: currentPeriodEnd })}
            </p>
          ) : null}
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={handleOpenPortal}
            disabled={isLoadingPortal}
          >
            {isLoadingPortal ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            {t("manageAction")}
          </Button>
          <Button asChild>
            <Link href="/pricing">{t("comparePlansAction")}</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
