"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lock, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SUBSCRIPTION_PLAN_CONFIG } from "@/features/subscription/subscription-config";
import { ROUTES } from "@/constants";

interface SubscriptionUpsellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscriptionUpsellDialog({
  open,
  onOpenChange,
}: SubscriptionUpsellDialogProps) {
  const t = useTranslations("subscription");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {t("upsellTitle")}
          </DialogTitle>
          <DialogDescription>{t("upsellDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(["light", "standard", "premium"] as const).map((plan) => {
            const config = SUBSCRIPTION_PLAN_CONFIG[plan];
            return (
              <div
                key={plan}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{t(`plan.${plan}`)}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {t("upsellPlanSummary", {
                        count: config.maxGenerationCount,
                        stock: config.stockImageLimit,
                        amount: config.monthlyPercoins,
                      })}
                    </p>
                  </div>
                  <Sparkles className="h-5 w-5 text-gray-500" />
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("laterAction")}
          </Button>
          <Button asChild>
            <Link href={`${ROUTES.CREDITS_PURCHASE}?tab=subscription`}>
              {t("seePlansAction")}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
