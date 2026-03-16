import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { PercoinPurchaseGrid } from "@/features/credits/components/PercoinPurchaseGrid";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";

async function PurchasePageContent() {
  await requireAuth();

  return (
    <div className="space-y-8">
      <PercoinPurchaseGrid />
    </div>
  );
}

interface PurchasePageProps {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}

export default async function PurchasePage({ searchParams }: PurchasePageProps) {
  const creditsT = await getTranslations("credits");
  const params = await searchParams;
  const isSuccess = params.success === "true";
  const isCanceled = params.canceled === "true";

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-6 md:pt-10 pb-12 px-4">
        <div className="mx-auto max-w-5xl">
          {/* ヒーローセクション（SeaArt風） */}
          <div className="mb-10 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-4xl">
              {creditsT("purchaseHeroLine1")}
              <br />
              {creditsT("purchaseHeroLine2")}
            </h1>
            <p className="mt-3 text-base text-muted-foreground md:text-lg">
              {creditsT("purchaseDescription")}
            </p>
          </div>

          {/* 成功メッセージ */}
          {isSuccess && (
            <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/50">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">
                    {creditsT("purchaseSuccessTitle")}
                  </h3>
                  <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                    {creditsT("purchaseSuccessDescription")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* キャンセルメッセージ */}
          {isCanceled && (
            <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950/50">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                    {creditsT("purchaseCanceledTitle")}
                  </h3>
                  <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
                    {creditsT("purchaseCanceledDescription")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 購入カードグリッド */}
          <Suspense fallback={
            <Card className="border-border">
              <CardContent className="p-8">
                <div className="h-96 rounded-lg bg-muted animate-pulse" />
              </CardContent>
            </Card>
          }>
            <PurchasePageContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
