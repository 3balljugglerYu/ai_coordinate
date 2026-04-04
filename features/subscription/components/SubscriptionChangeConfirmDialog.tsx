"use client";

import { ArrowRight, Coins, CreditCard, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SUBSCRIPTION_PLAN_CONFIG } from "@/features/subscription/subscription-config";
import type { SubscriptionChangePreview } from "@/features/subscription/lib/change-policy";

interface SubscriptionChangeConfirmDialogProps {
  open: boolean;
  preview: SubscriptionChangePreview | null;
  processing: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function SubscriptionChangeConfirmDialog({
  open,
  preview,
  processing,
  onConfirm,
  onOpenChange,
}: SubscriptionChangeConfirmDialogProps) {
  const t = useTranslations("subscription");
  const locale = useLocale();

  if (!preview) {
    return null;
  }

  const currencyFormatter = new Intl.NumberFormat(
    locale === "ja" ? "ja-JP" : "en-US"
  );
  const dateFormatter = new Intl.DateTimeFormat(
    locale === "ja" ? "ja-JP" : "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  );

  const effectiveDate = dateFormatter.format(new Date(preview.effectiveAt));
  const targetPriceAmountYen =
    SUBSCRIPTION_PLAN_CONFIG[preview.targetPlan].prices[
      preview.targetBillingInterval
    ].amountYen;
  const formatPlanLabel = (
    plan: SubscriptionChangePreview["currentPlan"],
    billingInterval: SubscriptionChangePreview["currentBillingInterval"]
  ) => `${t(`plan.${plan}`)}（${t(`billing.${billingInterval}`)}）`;

  const currentPlanLabel = formatPlanLabel(
    preview.currentPlan,
    preview.currentBillingInterval
  );
  const targetPlanLabel = formatPlanLabel(
    preview.targetPlan,
    preview.targetBillingInterval
  );
  const actionLabel = t(`changeActions.${preview.changeKind}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {preview.isImmediate
              ? t("changeDialogImmediateTitle")
              : t("changeDialogScheduledTitle")}
          </DialogTitle>
          <DialogDescription>
            {preview.isImmediate
              ? t("changeDialogImmediateDescription")
              : t("changeDialogScheduledDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
                  {t("changeCurrentPlanLabel")}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {currentPlanLabel}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
                  {t("changeTargetPlanLabel")}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {targetPlanLabel}
                </p>
              </div>
            </div>
          </div>

          {preview.isImmediate ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-center">
                <p className="text-sm font-semibold text-emerald-900">
                  {t("changeChargeNowLabel")}
                </p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-gray-950">
                  {preview.amountDueYen && preview.amountDueYen > 0
                    ? `¥${currencyFormatter.format(preview.amountDueYen)}`
                    : t("changeNoImmediateCharge")}
                </p>
              </div>

              <div className="p-1">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1">
                  <div className="flex flex-col items-center gap-0.5 px-1 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-500">
                      <CreditCard className="h-4 w-4" />
                      <span className="text-xs font-medium leading-tight tracking-[0.08em]">
                        {t("changeTargetPriceLabel")}
                      </span>
                    </div>
                    <p className="text-center text-2xl font-bold tracking-tight text-gray-950">
                      ¥{currencyFormatter.format(targetPriceAmountYen)}
                    </p>
                  </div>

                  <div className="flex items-center justify-center pb-0.5 text-2xl font-semibold text-gray-300">
                    −
                  </div>

                  <div className="flex flex-col items-center gap-0.5 px-1 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-500">
                      <Sparkles className="h-4 w-4" />
                      <span className="text-xs font-medium leading-tight tracking-[0.08em]">
                        {t("changeCreditLabel")}
                      </span>
                    </div>
                    <p className="text-center text-2xl font-bold tracking-tight text-gray-950">
                      {preview.creditAmountYen && preview.creditAmountYen > 0
                        ? `¥${currencyFormatter.format(preview.creditAmountYen)}`
                        : "¥0"}
                    </p>
                  </div>

                  <div className="flex items-center justify-center pb-0.5 text-2xl font-semibold text-gray-300">
                    =
                  </div>

                  <div className="flex flex-col items-center gap-0.5 px-1 text-center">
                    <div className="flex items-center justify-center gap-2 text-emerald-700">
                      <CreditCard className="h-4 w-4" />
                      <span className="text-xs font-medium leading-tight tracking-[0.08em]">
                        {t("changeChargeNowLabel")}
                      </span>
                    </div>
                    <p className="text-center text-2xl font-bold tracking-tight text-gray-950">
                      {preview.amountDueYen && preview.amountDueYen > 0
                        ? `¥${currencyFormatter.format(preview.amountDueYen)}`
                        : t("changeNoImmediateCharge")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="flex items-start gap-3">
                  <Coins className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
                  <div>
                    <p className="text-sm font-semibold text-sky-950">
                      {t("changeGrantLabel")}
                    </p>
                    <p className="mt-1 text-sm text-sky-900/80">
                      {preview.grantAmount > 0
                        ? t("changeGrantDifferenceDescription", {
                            amount: preview.grantAmount,
                          })
                        : preview.targetBillingInterval === "year"
                          ? t("changeGrantMonthlySchedule")
                          : t("changeGrantOnRenewal")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-gray-500">
                  <CreditCard className="h-4 w-4" />
                  <span className="text-xs font-medium tracking-[0.08em]">
                    {t("changeChargeNowLabel")}
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {preview.amountDueYen && preview.amountDueYen > 0
                    ? `¥${currencyFormatter.format(preview.amountDueYen)}`
                    : t("changeNoImmediateCharge")}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-gray-500">
                  <Coins className="h-4 w-4" />
                  <span className="text-xs font-medium tracking-[0.08em]">
                    {t("changeGrantLabel")}
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {preview.grantAmount > 0
                    ? t("changeGrantAmount", { amount: preview.grantAmount })
                    : t("changeGrantOnRenewal")}
                </p>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-600">{actionLabel}</Badge>
              <span className="text-sm font-medium text-emerald-900">
                {preview.isImmediate
                  ? t("changeEffectiveNow")
                  : t("changeEffectiveAt", { date: effectiveDate })}
              </span>
            </div>
            <p className="mt-2 text-sm text-emerald-900/80">
              {preview.isImmediate
                ? t("changeImmediateHint", { date: effectiveDate })
                : t("changeScheduledHint", { date: effectiveDate })}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={processing}
          >
            {t("laterAction")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={processing}>
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
