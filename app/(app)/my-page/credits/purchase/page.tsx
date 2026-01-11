import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { StripePricingTable } from "@/features/credits/components/StripePricingTable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, XCircle, ShoppingCart } from "lucide-react";

async function PurchasePageContent() {
  const user = await requireAuth();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-gray-500" />
          ペルコインを購入
        </CardTitle>
        <CardDescription>
          以下のプランからお選びいただけます。決済完了後、即座にペルコインが付与されます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mt-6">
          <StripePricingTable userId={user.id} />
        </div>
      </CardContent>
    </Card>
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
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-4xl">
          {/* タイトル */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold md:text-3xl">ペルコイン購入</h1>
            <p className="mt-2 text-sm text-gray-600">
              クレジットカードで安全にお支払いいただけます
            </p>
          </div>

          {/* 成功メッセージ */}
          {isSuccess && (
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-green-900">決済が完了しました</h3>
                  <p className="mt-1 text-sm text-green-800">
                    ペルコインが付与されました。残高を確認してください。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* キャンセルメッセージ */}
          {isCanceled && (
            <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-yellow-900">決済がキャンセルされました</h3>
                  <p className="mt-1 text-sm text-yellow-800">
                    決済は完了していません。再度お試しください。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Pricing Table */}
          <Suspense fallback={
            <Card>
              <CardContent className="p-8">
                <div className="h-96 bg-gray-100 rounded-lg animate-pulse" />
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
