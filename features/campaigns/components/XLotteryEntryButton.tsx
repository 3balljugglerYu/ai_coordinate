"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  buildPublicMountUrl,
  trackMountShareEvent,
} from "@/features/collections/lib/share-mount";
import {
  buildXLotteryIntentUrl,
  findActiveXLotteryCampaign,
  type XLotteryCampaign,
} from "../x-lottery-campaign";

/**
 * 完走台紙の所有者にだけ表示する「Xで応募する」ボタン(キャンペーン期間中のみ)。
 *
 * 既存のシェア(URLのみ / OGP優先)とは別に、応募条件(ハッシュタグ + 主催者メンション)
 * を満たす X intent を開く。期間・対象カテゴリの判定は x-lottery-campaign に集約。
 * クライアント時刻で表示可否を判定するため、SSRとの hydration mismatch を避けて
 * マウント後に描画する(未該当なら何も出さない)。
 */
export function XLotteryEntryButton({
  categoryKey,
  completionId,
  mountImageUrl,
}: {
  categoryKey: string;
  completionId: string;
  mountImageUrl: string;
}) {
  // クライアント時刻(new Date)で期間判定するため、マウント後にだけ解決する
  // (SSRでは常に非表示にして hydration mismatch を避ける。ShareLinkButton と同方式)。
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // マウント検知の1回だけの setState。SSR/CSR の時刻差による hydration mismatch を
    // 避けるための正当な用途で、cascading render は起きない。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const campaign: XLotteryCampaign | null = mounted
    ? findActiveXLotteryCampaign(categoryKey, new Date())
    : null;

  if (!campaign) return null;

  const handleClick = () => {
    const shareUrl = buildPublicMountUrl(completionId, mountImageUrl);
    const intentUrl = buildXLotteryIntentUrl(campaign, shareUrl);
    // 応募=シェアなので既存の共有計測も呼ぶ(best-effort)。
    trackMountShareEvent(completionId);
    window.open(intentUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 px-5 py-4">
      <p className="text-sm font-bold text-amber-700">
        🎁 Xでシェアして応募しよう！
      </p>
      <p className="text-xs leading-relaxed text-amber-700/90">
        抽選で1名様に <span className="font-bold">Amazonギフト3,000円分</span>
      </p>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-full bg-[#1d1d1f] px-6 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Xで応募する
      </button>
      <Link
        href={campaign.rulesPath}
        className="text-[11px] text-amber-700/80 underline hover:text-amber-800"
      >
        応募規約・注意事項をみる
      </Link>
    </div>
  );
}
