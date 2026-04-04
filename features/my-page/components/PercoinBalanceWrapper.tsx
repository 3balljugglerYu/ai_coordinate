import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { ROUTES } from "@/constants";
import { requireAuth } from "@/lib/auth";
import { getPercoinBalanceServer } from "../lib/server-api";

/**
 * サーバーコンポーネント: ペルコイン残高のデータ取得と表示
 */
export async function PercoinBalanceWrapper() {
  const locale = await getLocale();
  const creditsT = await getTranslations("credits");
  const myPageT = await getTranslations("myPage");
  const user = await requireAuth();
  const percoinBalance = await getPercoinBalanceServer(user.id);
  const formatter = new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US");

  return (
    <div className="mb-6">
      <Link href={ROUTES.CREDITS_PURCHASE}>
        <Card className="p-4 transition-opacity hover:opacity-90 cursor-pointer">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
                <Image
                  src="/percoin.png"
                  alt={creditsT("percoinUnit")}
                  width={48}
                  height={48}
                  className="object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-gray-600">{creditsT("balanceLabel")}</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatter.format(percoinBalance)} {creditsT("percoinUnit")}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-600">
              <Plus className="h-4 w-4" />
              {myPageT("buy")}
            </span>
          </div>
        </Card>
      </Link>
      <div className="mt-2 flex justify-end pr-4">
        <Link
          href={ROUTES.MY_PAGE_CREDITS}
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          {myPageT("transactionHistoryLink")}
        </Link>
      </div>
    </div>
  );
}
