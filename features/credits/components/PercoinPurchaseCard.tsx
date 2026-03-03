"use client";

import Image from "next/image";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PercoinPackage } from "@/features/credits/percoin-packages";
import { BADGE_LABEL_MOST_VALUABLE } from "@/features/credits/percoin-packages";

export type PercoinPurchaseCardVariant = "grid" | "section";

interface PercoinPurchaseCardProps {
  pkg: PercoinPackage;
  processingId: string | null;
  onPurchase: (packageId: string) => void;
  variant?: PercoinPurchaseCardVariant;
}

/**
 * ペルコイン購入カード（PercoinPurchaseGrid / PercoinPurchaseSection で共有）
 */
export function PercoinPurchaseCard({
  pkg,
  processingId,
  onPurchase,
  variant = "grid",
}: PercoinPurchaseCardProps) {
  const isGrid = variant === "grid";
  const isProcessing = processingId === pkg.id;

  return (
    <Card
      className={
        isGrid
          ? "group relative flex flex-col overflow-hidden border-border bg-card transition-all duration-200 hover:shadow-lg hover:border-primary/20"
          : "group relative border-border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:border-primary/20"
      }
    >
      {pkg.badgeLabel && (
        pkg.badgeLabel === BADGE_LABEL_MOST_VALUABLE ? (
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
      <div className={isGrid ? "p-6 pb-4" : "mb-4"}>
        {pkg.imageUrl ? (
          <div
            className={
              isGrid
                ? "relative mx-auto mb-5 aspect-square w-[40%] overflow-hidden rounded-xl bg-white"
                : "relative mx-auto mb-4 aspect-square w-[40%] overflow-hidden rounded-xl bg-white"
            }
          >
            <Image
              src={pkg.imageUrl}
              alt={pkg.name}
              fill
              className="object-contain transition-transform duration-200 group-hover:scale-105"
              sizes={isGrid ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" : "(max-width: 768px) 100vw, 50vw"}
            />
          </div>
        ) : (
          <div
            className={
              isGrid
                ? "mx-auto mb-5 flex aspect-square w-[40%] items-center justify-center rounded-xl bg-white"
                : "mx-auto mb-4 flex aspect-square w-[40%] items-center justify-center rounded-xl bg-white"
            }
          >
            <Coins className={isGrid ? "h-14 w-14 text-muted-foreground" : "h-12 w-12 text-muted-foreground"} />
          </div>
        )}
        <h3 className={isGrid ? "text-xl font-bold text-foreground" : "text-lg font-bold text-foreground"}>
          {pkg.name}
        </h3>
        {pkg.description && (
          <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
            {pkg.description}
          </p>
        )}
      </div>
      <div className={isGrid ? "mt-auto border-t border-border p-6 pt-4" : "mb-4"}>
        <div className={`flex items-baseline gap-2 ${isGrid ? "mb-4" : ""}`}>
          <span
            className={
              isGrid
                ? "text-3xl font-bold tracking-tight text-foreground"
                : "text-2xl font-bold text-foreground"
            }
          >
            ¥{pkg.priceYen.toLocaleString()}
          </span>
          {!isGrid && (
            <span className="text-sm text-muted-foreground">
              （{pkg.credits.toLocaleString()}ペルコイン）
            </span>
          )}
        </div>
        <Button
          className={
            isGrid
              ? "h-12 w-full bg-percoin-button text-base font-bold text-white hover:bg-percoin-button-hover"
              : "h-11 w-full bg-percoin-button font-bold text-white hover:bg-percoin-button-hover"
          }
          disabled={isProcessing}
          onClick={() => onPurchase(pkg.id)}
        >
          {isProcessing ? "処理中..." : "購入する"}
        </Button>
      </div>
    </Card>
  );
}
