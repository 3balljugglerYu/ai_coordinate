"use client";

import { useState } from "react";
import Image from "next/image";
import { track } from "@vercel/analytics/react";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PERCOIN_PACKAGES } from "@/features/credits/percoin-packages";
import { completeMockPercoinPurchase } from "@/features/credits/lib/api";

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

      const baseUrl = window.location.origin;
      const purchasePath = "/my-page/credits/purchase";

      const response = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          packageId,
          successUrl: `${baseUrl}${purchasePath}?success=true`,
          cancelUrl: `${baseUrl}${purchasePath}?canceled=true`,
        }),
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
          <Card
            key={pkg.id}
            className="group relative flex flex-col overflow-hidden border-border bg-card transition-all duration-200 hover:shadow-lg hover:border-primary/20"
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
            <div className="p-6 pb-4">
              {pkg.imageUrl ? (
                <div className="relative mx-auto mb-5 aspect-square w-[40%] overflow-hidden rounded-xl bg-white">
                  <Image
                    src={pkg.imageUrl}
                    alt={pkg.name}
                    fill
                    className="object-contain transition-transform duration-200 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
              ) : (
                <div className="mx-auto mb-5 flex aspect-square w-[40%] items-center justify-center rounded-xl bg-white">
                  <Coins className="h-14 w-14 text-muted-foreground" />
                </div>
              )}
              <h3 className="text-xl font-bold text-foreground">{pkg.name}</h3>
              {pkg.description && (
                <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
                  {pkg.description}
                </p>
              )}
            </div>
            <div className="mt-auto border-t border-border p-6 pt-4">
              <div className="mb-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  ¥{pkg.priceYen.toLocaleString()}
                </span>
              </div>
              <Button
                className="h-12 w-full bg-[#6695E3] text-base font-bold text-white hover:bg-[#6695E3]/90"
                disabled={processingId === pkg.id}
                onClick={() => handlePurchase(pkg.id)}
              >
                {processingId === pkg.id ? "処理中..." : "購入する"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
