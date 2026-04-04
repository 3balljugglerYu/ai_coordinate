"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface BillingPageTabsProps {
  active: "subscription" | "credits";
  onChange: (tab: "subscription" | "credits") => void;
  className?: string;
}

export function BillingPageTabs({
  active,
  onChange,
  className,
}: BillingPageTabsProps) {
  const subscriptionT = useTranslations("subscription");
  const creditsT = useTranslations("credits");

  return (
    <div
      role="tablist"
      aria-label={subscriptionT("tabListLabel")}
      className={cn(
        "relative mx-auto flex w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm",
        className
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-[1rem] bg-gray-900 shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none",
          active === "credits" && "translate-x-full"
        )}
      />
      <button
        type="button"
        role="tab"
        aria-selected={active === "subscription"}
        onClick={() => onChange("subscription")}
        className={cn(
          "relative z-10 flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-200 ease-out motion-reduce:transition-none md:min-h-14 md:text-base",
          active === "subscription"
            ? "text-white"
            : "text-gray-600 hover:text-gray-900"
        )}
      >
        {subscriptionT("tabLabel")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "credits"}
        onClick={() => onChange("credits")}
        className={cn(
          "relative z-10 flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-200 ease-out motion-reduce:transition-none md:min-h-14 md:text-base",
          active === "credits"
            ? "text-white"
            : "text-gray-600 hover:text-gray-900"
        )}
      >
        {creditsT("purchaseTabLabel")}
      </button>
    </div>
  );
}
