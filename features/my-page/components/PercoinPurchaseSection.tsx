"use client";

import { useState } from "react";
import Image from "next/image";
import { track } from "@vercel/analytics/react";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PERCOIN_PACKAGES } from "@/features/credits/percoin-packages";
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
          <Card
            key={pkg.id}
            className="group relative border-border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:border-primary/20"
          >
            {pkg.badgeLabel && (
              pkg.badgeLabel === "もっともお得！" ? (
                <span className="absolute left-4 top-4 z-10 rounded-md bg-black px-2.5 py-1 text-xs font-bold text-white">
                  {pkg.badgeLabel}
                </span>
              ) : (
                <span className="absolute left-4 top-4 z-10 overflow-hidden rounded-md bg-black">
                  <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,45%,#D8EBFF,55%,transparent)] bg-[length:250%_100%] animate-shine opacity-60 mix-blend-overlay pointer-events-none" />
                  <span className="relative z-10 block px-2.5 py-1 text-xs font-bold text-white">
                    {pkg.badgeLabel}
                  </span>
                </span>
              )
            )}
            {pkg.imageUrl ? (
              <div className="relative mx-auto mb-4 aspect-square w-[40%] overflow-hidden rounded-xl bg-white">
                <Image
                  src={pkg.imageUrl}
                  alt={pkg.name}
                  fill
                  className="object-contain transition-transform duration-200 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            ) : (
              <div className="mx-auto mb-4 flex aspect-square w-[40%] items-center justify-center rounded-xl bg-white">
                <Coins className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
            <div className="mb-4">
              <h3 className="text-lg font-bold text-foreground">{pkg.name}</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{pkg.description}</p>
            </div>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                ¥{pkg.priceYen.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                （{pkg.credits.toLocaleString()}ペルコイン）
              </span>
            </div>
            <Button
              className="h-11 w-full bg-[#6695E3] font-bold text-white hover:bg-[#6695E3]/90"
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
