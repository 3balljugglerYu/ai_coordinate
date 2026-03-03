"use client";

import { useState } from "react";
import { track } from "@vercel/analytics/react";
import { PERCOIN_PACKAGES } from "@/features/credits/percoin-packages";
import { completeMockPercoinPurchase } from "@/features/credits/lib/api";
import { PercoinPurchaseCard } from "./PercoinPurchaseCard";

/**
 * ペルコイン購入グリッド（自前UI + Checkout Session API）
 * Stripe Pricing Tableの4商品制限を回避し、5つすべてのパッケージを表示
 */
export function PercoinPurchaseGrid() {
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
        setSuccessMessage(
          `ペルコインを付与しました（モックモード）。残高: ${result.balance}`
        );
        track("percoin_purchase_complete", { packageId, mode: "mock" });
      } else if (data.checkoutUrl) {
        track("percoin_purchase_started", { packageId, mode: "stripe" });
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error("不明なレスポンスです");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "購入処理に失敗しました";
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
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200">
          {successMessage}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PERCOIN_PACKAGES.map((pkg) => (
          <PercoinPurchaseCard
            key={pkg.id}
            pkg={pkg}
            processingId={processingId}
            onPurchase={handlePurchase}
            variant="grid"
          />
        ))}
      </div>
    </div>
  );
}
