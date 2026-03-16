"use client";

import { useState } from "react";
import { track } from "@vercel/analytics/react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { PERCOIN_PACKAGES } from "@/features/credits/percoin-packages";
import { completeMockPercoinPurchase } from "@/features/credits/lib/api";
import { PercoinPurchaseCard } from "@/features/credits/components/PercoinPurchaseCard";

interface PercoinPurchaseSectionProps {
  onBalanceUpdate: (balance: number) => void;
}

export function PercoinPurchaseSection({
  onBalanceUpdate,
}: PercoinPurchaseSectionProps) {
  const t = useTranslations("credits");
  const locale = useLocale();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handlePurchase = async (packageId: string) => {
    try {
      setProcessingId(packageId);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ packageId }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || t("checkoutCreateFailed"));
      }

      if (data.mode === "mock") {
        const result = await completeMockPercoinPurchase(
          { packageId },
          { mockPurchaseFailed: t("mockPurchaseFailed") }
        );
        onBalanceUpdate(result.balance);
        setSuccessMessage(
          t("mockPurchaseSuccessWithBalance", {
            balance: new Intl.NumberFormat(
              locale === "ja" ? "ja-JP" : "en-US"
            ).format(result.balance),
          })
        );
        track("percoin_purchase_complete", { packageId, mode: "mock" });
      } else if (data.checkoutUrl) {
        track("percoin_purchase_started", { packageId, mode: "stripe" });
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error(t("unknownPurchaseResponse"));
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t("purchaseProcessFailed");
      track("percoin_purchase_failed", {
        packageId,
        error: errorMessage.substring(0, 100),
      });
      setError(errorMessage);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Card className="border-border bg-card p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">
          {t("purchaseSectionTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("purchaseSectionDescription")}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200">
          {successMessage}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {PERCOIN_PACKAGES.map((pkg) => (
          <PercoinPurchaseCard
            key={pkg.id}
            pkg={pkg}
            processingId={processingId}
            onPurchase={handlePurchase}
            variant="section"
          />
        ))}
      </div>
    </Card>
  );
}
