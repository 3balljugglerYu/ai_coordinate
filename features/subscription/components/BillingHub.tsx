"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { PricingPlans } from "@/features/subscription/components/PricingPlans";
import { BillingPageTabs } from "@/features/subscription/components/BillingPageTabs";
import { SubscriptionPortalButton } from "@/features/subscription/components/SubscriptionPortalButton";
import { PercoinPurchaseGrid } from "@/features/credits/components/PercoinPurchaseGrid";
import { Button } from "@/components/ui/button";
import { CheckCircle2, LoaderCircle, Sparkles, XCircle } from "lucide-react";
import { isActiveSubscriptionStatus } from "@/features/subscription/subscription-config";
import type { UserSubscription } from "@/features/subscription/lib/server-api";

interface BillingHubProps {
  subscription: UserSubscription | null;
  initialTab: "subscription" | "credits";
  isSuccess: boolean;
  isCanceled: boolean;
}

export function BillingHub({
  subscription,
  initialTab,
  isSuccess,
  isCanceled,
}: BillingHubProps) {
  const creditsT = useTranslations("credits");
  const subscriptionT = useTranslations("subscription");
  const locale = useLocale();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"subscription" | "credits">(
    initialTab
  );
  const [isResuming, startResumeTransition] = useTransition();
  const [resumeError, setResumeError] = useState<string | null>(null);
  const hasActiveSubscription =
    subscription != null && isActiveSubscriptionStatus(subscription.status);
  const pendingCancellationDate = useMemo(() => {
    if (!subscription) return null;
    const source =
      subscription.cancel_at ??
      (subscription.cancel_at_period_end
        ? subscription.current_period_end
        : null);
    if (!source) return null;
    return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(source));
  }, [subscription, locale]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleResume = () => {
    setResumeError(null);
    startResumeTransition(async () => {
      try {
        const response = await fetch("/api/subscription/resume", {
          method: "POST",
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || subscriptionT("resumeError"));
        }
        router.refresh();
      } catch (error) {
        setResumeError(
          error instanceof Error ? error.message : subscriptionT("resumeError")
        );
      }
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (activeTab === "subscription") {
      url.searchParams.set("tab", "subscription");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.replaceState(window.history.state, "", url.toString());
  }, [activeTab]);

  return (
    <div className="space-y-8">
      <BillingPageTabs active={activeTab} onChange={setActiveTab} />

      <div
        key={activeTab}
        className="animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none"
      >
        {activeTab === "subscription" ? (
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="text-center">
                <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-4xl">
                  {subscriptionT("heroLine1")}
                  <br />
                  {subscriptionT("heroLine2")}
                </h1>
                <p className="mx-auto mt-3 max-w-3xl text-base text-muted-foreground md:text-lg">
                  {subscriptionT("heroDescription")}
                </p>
              </div>

              {hasActiveSubscription ? (
                <div className="flex justify-end">
                  <SubscriptionPortalButton className="h-10 w-auto rounded-full px-4 text-sm shadow-sm" />
                </div>
              ) : null}
            </div>

            {hasActiveSubscription && pendingCancellationDate ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    {subscriptionT("cancelAtPeriodEnd", {
                      date: pendingCancellationDate,
                    })}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResume}
                    disabled={isResuming}
                    className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                  >
                    {isResuming ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : null}
                    {subscriptionT("resumeAction")}
                  </Button>
                </div>
                {resumeError ? (
                  <p className="mt-2 text-sm text-destructive">{resumeError}</p>
                ) : null}
              </div>
            ) : null}

            <PricingPlans subscription={subscription} />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-4xl">
                {creditsT("purchaseHeroLine1")}
                <br />
                {creditsT("purchaseHeroLine2")}
              </h1>
              <p className="mt-3 text-base text-muted-foreground md:text-lg">
                {creditsT("purchaseDescription")}
              </p>
            </div>

            {isSuccess ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/50">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">
                      {creditsT("purchaseSuccessTitle")}
                    </h3>
                    <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                      {creditsT("purchaseSuccessDescription")}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {isCanceled ? (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950/50">
                <div className="flex items-start gap-3">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                      {creditsT("purchaseCanceledTitle")}
                    </h3>
                    <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
                      {creditsT("purchaseCanceledDescription")}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {!hasActiveSubscription ? (
              <Card className="border-dashed border-gray-300 bg-white p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {subscriptionT("purchaseBannerTitle")}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {subscriptionT("purchaseBannerDescription")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setActiveTab("subscription")}
                  >
                    <Sparkles className="h-4 w-4" />
                    {subscriptionT("seePlansAction")}
                  </Button>
                </div>
              </Card>
            ) : null}

            <PercoinPurchaseGrid />
          </div>
        )}
      </div>
    </div>
  );
}
