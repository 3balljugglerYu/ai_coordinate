"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, Check, LoaderCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getSubscriptionChangeKind,
  type SubscriptionChangePreview,
} from "@/features/subscription/lib/change-policy";
import {
  SUBSCRIPTION_PLAN_CONFIG,
  isActiveSubscriptionStatus,
  type PaidSubscriptionPlan,
  type SubscriptionBillingInterval,
  type SubscriptionPlan,
} from "@/features/subscription/subscription-config";
import type { UserSubscription } from "@/features/subscription/lib/server-api";
import { SubscriptionChangeConfirmDialog } from "@/features/subscription/components/SubscriptionChangeConfirmDialog";
import { SubscriptionImmediateChangeFinalDialog } from "@/features/subscription/components/SubscriptionImmediateChangeFinalDialog";
import { SubscriptionChangeFailureDialog } from "@/features/subscription/components/SubscriptionChangeFailureDialog";

const PLANS: PaidSubscriptionPlan[] = ["light", "standard", "premium"];

interface PricingPlansProps {
  subscription: UserSubscription | null;
}

export function PricingPlans({ subscription }: PricingPlansProps) {
  const t = useTranslations("subscription");
  const locale = useLocale();
  const router = useRouter();
  const defaultBillingInterval = subscription?.billing_interval ?? "month";
  const [billingInterval, setBillingInterval] =
    useState<SubscriptionBillingInterval>(defaultBillingInterval);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [cancelingScheduledChange, setCancelingScheduledChange] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<SubscriptionChangePreview | null>(null);
  const [finalImmediatePreview, setFinalImmediatePreview] =
    useState<SubscriptionChangePreview | null>(null);
  const [paymentFailureMessage, setPaymentFailureMessage] = useState<
    string | null
  >(null);
  const hasActiveSubscription =
    subscription != null && isActiveSubscriptionStatus(subscription.status);

  useEffect(() => {
    if (subscription?.billing_interval) {
      setBillingInterval(subscription.billing_interval);
    }
  }, [subscription?.billing_interval]);

  const priceFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US"),
    [locale]
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [locale]
  );

  const activePlan =
    hasActiveSubscription && subscription?.plan !== "free"
      ? subscription.plan
      : null;
  const activeBillingInterval =
    hasActiveSubscription && subscription?.billing_interval
      ? subscription.billing_interval
      : null;

  const scheduledTargetKey =
    subscription?.scheduled_plan && subscription?.scheduled_billing_interval
      ? `${subscription.scheduled_plan}:${subscription.scheduled_billing_interval}`
      : null;

  const getPlanKey = (
    plan: Exclude<SubscriptionPlan, "free">,
    interval: SubscriptionBillingInterval
  ) => `${plan}:${interval}`;

  const getActionLabel = (
    plan: PaidSubscriptionPlan,
    interval: SubscriptionBillingInterval
  ) => {
    const planKey = getPlanKey(plan, interval);
    const isCurrentSelection =
      activePlan === plan && activeBillingInterval === interval;

    if (isCurrentSelection) {
      return t("currentPlanAction");
    }

    if (scheduledTargetKey === planKey) {
      return t("scheduledPlanAction");
    }

    if (!hasActiveSubscription || !activePlan || !activeBillingInterval) {
      return t("subscribeAction");
    }

    const changeKind = getSubscriptionChangeKind({
      currentPlan: activePlan,
      currentBillingInterval: activeBillingInterval,
      targetPlan: plan,
      targetBillingInterval: interval,
    });

    return t(`changeActions.${changeKind}`);
  };

  const handleCheckout = async (planId: PaidSubscriptionPlan) => {
    try {
      setProcessingKey(getPlanKey(planId, billingInterval));
      setError(null);
      setSuccess(null);
      setPaymentFailureMessage(null);

      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId,
          billingInterval,
        }),
      });
      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || t("checkoutError"));
      }

      window.location.href = data.checkoutUrl;
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : t("checkoutError")
      );
    } finally {
      setProcessingKey(null);
    }
  };

  const handlePlanAction = async (planId: PaidSubscriptionPlan) => {
    const targetKey = getPlanKey(planId, billingInterval);
    const isCurrentSelection =
      activePlan === planId && activeBillingInterval === billingInterval;

    if (isCurrentSelection || scheduledTargetKey === targetKey) {
      return;
    }

    if (!hasActiveSubscription) {
      await handleCheckout(planId);
      return;
    }

    try {
      setProcessingKey(targetKey);
      setError(null);
      setSuccess(null);
      setPaymentFailureMessage(null);

      const response = await fetch("/api/subscription/change-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId,
          billingInterval,
        }),
      });
      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok || !data) {
        throw new Error(data?.error || t("changePreviewError"));
      }

      setPreview(data as SubscriptionChangePreview);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : t("changePreviewError")
      );
    } finally {
      setProcessingKey(null);
    }
  };

  const handleConfirmChange = async () => {
    const changePreview = finalImmediatePreview ?? preview;

    if (!changePreview) {
      return;
    }

    const confirmedPreview = changePreview;
    const targetKey = getPlanKey(
      confirmedPreview.targetPlan,
      confirmedPreview.targetBillingInterval
    );

    try {
      setProcessingKey(targetKey);
      setError(null);
      setSuccess(null);

      const response = await fetch("/api/subscription/change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: confirmedPreview.targetPlan,
          billingInterval: confirmedPreview.targetBillingInterval,
          confirmedIntervalChange: confirmedPreview.confirmationRequired,
        }),
      });
      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok || !data) {
        throw new Error(data?.error || t("changeSubmitError"));
      }

      setPreview(null);
      setFinalImmediatePreview(null);
      setSuccess(
        data.scheduled
          ? t("changeSuccessScheduled", {
              date: dateFormatter.format(new Date(data.effectiveAt)),
            })
          : data.grantAmount > 0
            ? t("changeSuccessImmediate", {
                amount: data.grantAmount,
              })
            : confirmedPreview.targetBillingInterval === "year"
              ? t("changeSuccessImmediateMonthlyGrant")
              : t("changeSuccessImmediateNoGrant")
      );
      router.refresh();
    } catch (changeError) {
      const message =
        changeError instanceof Error
          ? changeError.message
          : t("changeSubmitError");

      setError(message);
      setFinalImmediatePreview(null);
      setPreview(null);

      if (confirmedPreview.isImmediate) {
        setPaymentFailureMessage(message);
      }
    } finally {
      setProcessingKey(null);
    }
  };

  const handleRequestConfirmChange = () => {
    if (!preview) {
      return;
    }

    if (preview.isImmediate) {
      setFinalImmediatePreview(preview);
      setPreview(null);
      return;
    }

    void handleConfirmChange();
  };

  const handleCancelScheduledChange = async () => {
    try {
      setCancelingScheduledChange(true);
      setError(null);
      setSuccess(null);
      setPaymentFailureMessage(null);

      const response = await fetch("/api/subscription/cancel-scheduled-change", {
        method: "POST",
      });
      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(data?.error || t("cancelScheduledChangeError"));
      }

      setSuccess(t("cancelScheduledChangeSuccess"));
      router.refresh();
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : t("cancelScheduledChangeError")
      );
    } finally {
      setCancelingScheduledChange(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setBillingInterval(value)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                billingInterval === value
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              {t(`billing.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {subscription?.scheduled_plan &&
      subscription.scheduled_billing_interval &&
      subscription.scheduled_change_at ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <div className="flex items-start justify-between gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{t("scheduledChangeTitle")}</p>
              <p className="mt-1 text-sky-900/80">
                {t("scheduledChangeDescription", {
                  plan: t(`plan.${subscription.scheduled_plan}`),
                  billing: t(
                    `billing.${subscription.scheduled_billing_interval}`
                  ),
                  date: dateFormatter.format(
                    new Date(subscription.scheduled_change_at)
                  ),
                })}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-sky-300 bg-white text-sky-900 hover:bg-sky-100"
              onClick={handleCancelScheduledChange}
              disabled={cancelingScheduledChange || processingKey !== null}
            >
              {t("cancelScheduledChangeAction")}
            </Button>
          </div>
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {success}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {PLANS.map((plan) => {
          const config = SUBSCRIPTION_PLAN_CONFIG[plan];
          const price = config.prices[billingInterval].amountYen;
          const isRecommended = plan === "standard";
          const planKey = getPlanKey(plan, billingInterval);
          const isCurrentSelection =
            activePlan === plan && activeBillingInterval === billingInterval;
          const isScheduledSelection = scheduledTargetKey === planKey;

          return (
            <Card
              key={plan}
              className={cn(
                "relative flex h-full flex-col border-gray-200 bg-white p-7 pt-14",
                isRecommended && "border-gray-900 shadow-lg",
                isCurrentSelection && "border-emerald-400 shadow-lg shadow-emerald-100",
                isScheduledSelection && "border-sky-300 shadow-lg shadow-sky-100"
              )}
            >
              {isRecommended ? (
                <Badge className="absolute left-4 top-4">{t("recommended")}</Badge>
              ) : null}
              {isScheduledSelection ? (
                <Badge className="absolute right-4 top-4 bg-sky-600">
                  {t("scheduledPlanAction")}
                </Badge>
              ) : null}

              <div>
                <p className="text-sm font-medium text-gray-500">
                  {t(`badge.${plan}`)}
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-gray-900">
                  {t(`plan.${plan}`)}
                </h2>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-4xl font-bold text-gray-900">
                    ¥{priceFormatter.format(price)}
                  </span>
                  <span className="pb-1 text-sm text-gray-500">
                    /{t(`billing.${billingInterval}`)}
                  </span>
                </div>
                {billingInterval === "year" ? (
                  <p className="mt-2 text-sm text-emerald-700">
                    {t("yearlySavings")}
                  </p>
                ) : null}
              </div>

              <div className="mt-6 space-y-3 text-sm text-gray-700">
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>
                    {t("monthlyPercoins", {
                      amount: config.monthlyPercoins,
                    })}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>
                    {t("maxGenerationCount", {
                      count: config.maxGenerationCount,
                    })}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>
                    {t("stockImageLimit", {
                      count: config.stockImageLimit,
                    })}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>
                    {t("bonusMultiplier", {
                      multiplier: config.bonusMultiplier.toFixed(1),
                    })}
                  </span>
                </div>
              </div>

              <Button
                className="mt-8"
                size="lg"
        onClick={() => handlePlanAction(plan)}
                disabled={
                  processingKey !== null ||
                  isCurrentSelection ||
                  isScheduledSelection
                }
              >
                {processingKey === planKey ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                {getActionLabel(plan, billingInterval)}
              </Button>
            </Card>
          );
        })}
      </div>

      <SubscriptionChangeConfirmDialog
        open={preview != null}
        preview={preview}
        processing={processingKey !== null}
        onConfirm={handleRequestConfirmChange}
        onOpenChange={(open) => {
          if (!open) {
            setPreview(null);
          }
        }}
      />
      <SubscriptionImmediateChangeFinalDialog
        open={finalImmediatePreview != null}
        processing={processingKey !== null}
        onConfirm={handleConfirmChange}
        onOpenChange={(open) => {
          if (!open) {
            setFinalImmediatePreview(null);
          }
        }}
      />
      <SubscriptionChangeFailureDialog
        open={paymentFailureMessage != null}
        message={paymentFailureMessage}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentFailureMessage(null);
          }
        }}
      />
    </div>
  );
}
