import { Card } from "@/components/ui/card";

/**
 * クレジット残高カード用スケルトン
 */
export function CreditBalanceSkeleton() {
  return (
    <Card className="mb-6 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
          <div>
            <div className="mb-1 h-4 w-20 animate-pulse rounded bg-gray-200" />
            <div className="h-6 w-24 animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      </div>
    </Card>
  );
}
