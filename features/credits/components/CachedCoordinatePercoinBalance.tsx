import Link from "next/link";
import Image from "next/image";
import { cacheLife, cacheTag } from "next/cache";
import { getPercoinBalanceServer } from "@/features/my-page/lib/server-api";
import { getPercoinPurchaseUrl } from "../lib/urls";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/i18n/config";

interface CachedCoordinatePercoinBalanceProps {
  userId: string;
  locale: Locale;
  copy: {
    balanceLabel: string;
    percoinUnit: string;
  };
}

/**
 * コーディネートページ用: ペルコイン残高（use cache でサーバーキャッシュ）
 */
export async function CachedCoordinatePercoinBalance({
  userId,
  locale,
  copy,
}: CachedCoordinatePercoinBalanceProps) {
  "use cache";
  cacheTag(`coordinate-${userId}-${locale}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const percoinBalance = await getPercoinBalanceServer(userId, supabase);
  const formatter = new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US");

  return (
    <Link
      href={getPercoinPurchaseUrl("coordinate")}
      className="mb-6 inline-flex w-fit items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-opacity hover:opacity-80"
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
        <Image
          src="/percoin.png"
          alt={copy.percoinUnit}
          width={40}
          height={40}
          className="object-cover"
        />
      </div>
      <div>
        <p className="text-xs text-gray-500">{copy.balanceLabel}</p>
        <p className="text-lg font-bold text-gray-900">
          {formatter.format(percoinBalance)} {copy.percoinUnit}
        </p>
      </div>
    </Link>
  );
}
