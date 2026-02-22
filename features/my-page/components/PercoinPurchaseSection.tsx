"use client";

import { useState } from "react";
import { track } from "@vercel/analytics/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PERCOIN_PACKAGES,
} from "@/features/credits/percoin-packages";
import { completeMockPercoinPurchase } from "@/features/credits/lib/api";

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
        body: JSON.stringify({
          packageId,
          successUrl: window.location.href,
          cancelUrl: window.location.href,
        }),
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
      setError(err instanceof Error ? err.message : "購入処理に失敗しました");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900">ペルコイン購入</h2>
        <p className="mt-2 text-sm text-gray-600">
          Stripe承認完了まではモック決済でペルコインを付与します。承認後は同じUIでStripe Checkoutに切り替わります。
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {PERCOIN_PACKAGES.map((pkg) => (
          <Card key={pkg.id} className="border border-gray-200 p-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{pkg.name}</h3>
              <p className="mt-1 text-sm text-gray-600">{pkg.description}</p>
            </div>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">¥{pkg.priceYen.toLocaleString()}</span>
              <span className="text-sm text-gray-500">
                ({pkg.credits}ペルコイン)
              </span>
            </div>
            <Button
              className="w-full"
              disabled={processingId === pkg.id}
              onClick={() => handlePurchase(pkg.id)}
            >
              {processingId === pkg.id ? "処理中..." : "購入する"}
            </Button>
          </Card>
        ))}
      </div>
    </Card>
  );
}
