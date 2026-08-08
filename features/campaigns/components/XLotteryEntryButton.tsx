"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  buildPublicBookUrl,
  buildPublicMountUrl,
  trackMountShareEvent,
} from "@/features/collections/lib/share-mount";
import {
  buildXLotteryIntentUrl,
  getXLotteryCopy,
  isLotteryEntryOpen,
} from "../x-lottery-campaign";

/**
 * 完走ページの所有者にだけ表示する「Xで応募する」ボタン(受付期間中のみ)。
 *
 * 対象カテゴリか(lotteryTarget)・受付期間は admin 設定(preset_categories)由来で、
 * サーバーから props で受け取る。文面(タグ・メンション・賞品)はカテゴリ key から
 * X_LOTTERY_CAMPAIGNS を引く。マップに無いカテゴリは何も出さない(fail-closed)。
 *
 * variant:
 *  - "panel": 台紙ページ用の説明つきパネル(従来の見た目)
 *  - "chrome": book リーダー用のコンパクトなピル(没入UIに馴染ませる)
 *
 * クライアント時刻で期間判定するため、SSRとの hydration mismatch を避けてマウント後に描画する
 * (未該当なら何も出さない)。
 */
export function XLotteryEntryButton({
  categoryKey,
  lotteryTarget,
  entryStartsAt,
  entryEndsAt,
  completionId,
  view,
  mountImageUrl,
  variant = "panel",
}: {
  categoryKey: string;
  lotteryTarget: boolean;
  entryStartsAt: string | null;
  entryEndsAt: string | null;
  completionId: string;
  /** 応募ポストに載せるシェアページ。mount=/m/{id}, book=/m/{id}/book */
  view: "mount" | "book";
  /** mount ビューのときのみ。共有URLのキャッシュバスター(v=)抽出に使う。 */
  mountImageUrl?: string | null;
  variant?: "panel" | "chrome";
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // マウント検知の1回だけの setState。SSR/CSR の時刻差による hydration mismatch を
    // 避けるための正当な用途で、cascading render は起きない。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(isLotteryEntryOpen(lotteryTarget, entryStartsAt, entryEndsAt, new Date()));
  }, [lotteryTarget, entryStartsAt, entryEndsAt]);

  const copy = getXLotteryCopy(categoryKey);
  if (!open || !copy) return null;

  const handleClick = () => {
    const shareUrl =
      view === "book"
        ? buildPublicBookUrl(completionId)
        : buildPublicMountUrl(completionId, mountImageUrl);
    const intentUrl = buildXLotteryIntentUrl(copy, shareUrl);
    // 応募=シェアなので既存の共有計測も呼ぶ(best-effort)。
    trackMountShareEvent(completionId);
    window.open(intentUrl, "_blank", "noopener,noreferrer");
  };

  const xIcon = (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );

  if (variant === "chrome") {
    // book リーダー用: 没入UIの下部に置くコンパクト版。
    // 賞品などの詳細は規約リンクへ逃がし、ボタンは文言だけに絞る。
    return (
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex items-center gap-2 rounded-full bg-[#1d1d1f] px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          {xIcon}
          Xで応募する
        </button>
        {copy.attachmentNote ? (
          <p className="max-w-[280px] rounded bg-black/40 px-2 py-0.5 text-center text-[11px] leading-relaxed text-white/90">
            ※{copy.attachmentNote}
          </p>
        ) : null}
        <Link
          href={copy.rulesPath}
          className="rounded bg-black/40 px-2 py-0.5 text-[11px] text-white/90 underline hover:text-white"
        >
          応募規約・注意事項をみる
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 px-5 py-4">
      <p className="text-sm font-bold text-amber-700">
        🎁 Xでシェアして応募しよう！
      </p>
      <p className="text-xs leading-relaxed text-amber-700/90">
        抽選で{copy.winnersLabel}に <span className="font-bold">{copy.prizeLabel}</span>
      </p>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-full bg-[#1d1d1f] px-6 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        {xIcon}
        Xで応募する
      </button>
      {copy.attachmentNote ? (
        <p className="text-center text-[11px] leading-relaxed text-amber-700/90">
          ※{copy.attachmentNote}
        </p>
      ) : null}
      <Link
        href={copy.rulesPath}
        className="text-[11px] text-amber-700/80 underline hover:text-amber-800"
      >
        応募規約・注意事項をみる
      </Link>
    </div>
  );
}
