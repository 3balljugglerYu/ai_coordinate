"use client";

import { useState } from "react";
import { track } from "@vercel/analytics/react";
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

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Checkoutの作成に失敗しました");
      }

      if (data.mode === "mock") {
        const result = await completeMockPercoinPurchase({ packageId });
        onBalanceUpdate(result.balance);
        setSuccessMessage("ペルコインを付与しました（モックモード）");
        track("percoin_purchase_complete", { packageId, mode: "mock" });
      } else if (data.checkoutUrl) {
        track("percoin_purchase_started", { packageId, mode: "stripe" });
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error("不明なレスポンスです");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "購入処理に失敗しました";
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
        <h2 className="text-xl font-semibold text-foreground">ペルコイン購入</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Stripe承認完了まではモック決済でペルコインを付与します。承認後は同じUIでStripe Checkoutに切り替わります。
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
