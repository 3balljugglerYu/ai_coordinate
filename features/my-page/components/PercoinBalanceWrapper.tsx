import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth";
import { getPercoinBalanceServer } from "../lib/server-api";

/**
 * サーバーコンポーネント: ペルコイン残高のデータ取得と表示
 */
export async function PercoinBalanceWrapper() {
  const user = await requireAuth();
  const percoinBalance = await getPercoinBalanceServer(user.id);

  return (
    <Link href="/my-page/credits" className="block mb-6">
      <Card className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <CreditCard className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">ペルコイン残高</p>
              <p className="text-xl font-bold text-gray-900">
                {percoinBalance.toLocaleString()} ペルコイン
              </p>
            </div>
          </div>
          <div className="text-sm font-medium text-gray-600">取引履歴</div>
        </div>
      </Card>
    </Link>
  );
}
