import { Suspense } from "react";
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
              コーディネートを、<br />もっと自由に
            </h1>
            <p className="mt-3 text-base text-muted-foreground md:text-lg">
              あなたにぴったりのプランを選んで、創作を続けよう
            </p>
          </div>

          {/* 成功メッセージ */}
          {isSuccess && (
            <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/50">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">決済が完了しました</h3>
                  <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                    ペルコインが付与されました。残高を確認してください。
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
                  <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">決済がキャンセルされました</h3>
                  <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
                    決済は完了していません。再度お試しください。
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
