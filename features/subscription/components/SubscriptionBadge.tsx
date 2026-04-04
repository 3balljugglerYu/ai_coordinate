"use client";

import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";

interface SubscriptionBadgeProps {
  plan?: SubscriptionPlan | null;
  className?: string;
}

const PLAN_STYLES: Record<Exclude<SubscriptionPlan, "free">, string> = {
  light: "border-amber-300 bg-amber-50 text-amber-900",
  standard: "border-sky-300 bg-sky-50 text-sky-900",
  premium: "border-emerald-300 bg-emerald-50 text-emerald-900",
};

export function SubscriptionBadge({
  plan,
  className,
}: SubscriptionBadgeProps) {
  const t = useTranslations("subscription");

  if (!plan || plan === "free") {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 rounded-full px-2.5 py-1 text-[11px]", PLAN_STYLES[plan], className)}
    >
      <Crown className="h-3 w-3" />
      {t(`badge.${plan}`)}
    </Badge>
  );
}
