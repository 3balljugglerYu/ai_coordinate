import Link from "next/link";
import Image from "next/image";
import { cacheLife, cacheTag } from "next/cache";
import { getPercoinBalanceServer } from "@/features/my-page/lib/server-api";
import { getPercoinPurchaseUrl, type PercoinPurchaseReferrer } from "../lib/urls";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/i18n/config";

interface CachedGenerationPercoinBalanceProps {
  userId: string;
  locale: Locale;
  /** 表示元の生成ページ。キャッシュタグと購入ページの戻り先制御に使う。 */
  source: PercoinPurchaseReferrer;
  copy: {
    balanceLabel: string;
    percoinUnit: string;
  };
}

/**
 * 生成ページ(コーディネート / One-Tap Style)共通: ペルコイン残高
 * （use cache でサーバーキャッシュ）。
 *
 * source ごとにキャッシュタグを分け、購入ページへは ?from=<source> を付けて
 * 戻るボタンの遷移先を元の生成ページに戻す。
 */
export async function CachedGenerationPercoinBalance({
  userId,
  locale,
  source,
  copy,
}: CachedGenerationPercoinBalanceProps) {
  "use cache";
  cacheTag(`${source}-${userId}-${locale}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const percoinBalance = await getPercoinBalanceServer(userId, supabase);
  const formatter = new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US");

  return (
    <Link
      href={getPercoinPurchaseUrl(source)}
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
