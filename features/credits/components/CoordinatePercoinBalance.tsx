import Link from "next/link";
import Image from "next/image";
import { requireAuth } from "@/lib/auth";
import { getPercoinBalanceServer } from "@/features/my-page/lib/server-api";
import { getPercoinPurchaseUrl } from "../lib/urls";

/**
 * コーディネートページ用: ペルコイン残高のコンパクト表示（タップで購入画面へ遷移）
 */
export async function CoordinatePercoinBalance() {
  const user = await requireAuth();
  const percoinBalance = await getPercoinBalanceServer(user.id);

  return (
    <Link
      href={getPercoinPurchaseUrl("coordinate")}
      className="mb-6 inline-flex w-fit items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-opacity hover:opacity-80"
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
        <Image
          src="/percoin.png"
          alt="ペルコイン"
          width={40}
          height={40}
          className="object-cover"
        />
      </div>
      <div>
        <p className="text-xs text-gray-500">ペルコイン残高</p>
        <p className="text-lg font-bold text-gray-900">
          {percoinBalance.toLocaleString()} ペルコイン
        </p>
      </div>
    </Link>
  );
}
