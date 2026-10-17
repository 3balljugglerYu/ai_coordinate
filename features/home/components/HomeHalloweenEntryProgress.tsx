"use client";

import Link from "next/link";
import { nextTicketTier, ticketsForWorks } from "@/features/campaigns/hashtag-campaign/progress";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";

/** バーの段の数 = 最後の口数に届く作品数(10) */
const BAR_STEPS = Math.max(...HALLOWEEN_BEST_SHOT.tickets.map((tier) => tier.works));
const MAX_TICKETS = Math.max(...HALLOWEEN_BEST_SHOT.tickets.map((tier) => tier.tickets));

/**
 * ホームの「ハロウィン企画」の棚の上に出す、エントリーした人の進み具合(2026-10-17 ユーザー決定)。
 *
 * 3案(カード・細い帯・文字とバーだけ)を実画面で並べて「文字とバーだけ」に決まり、
 * バーの枠も3通り(企画ページと同じ濃い紫・枠なし・薄い枠)を並べて「薄い枠」に決まった。
 *
 * - 1行目: 「✓ エントリー中」「現在 ○作品(○口)」「あと○作品で○口！」。狭い幅では、まとまりごとに折り返す
 * - 2行目: 10段のバー。口数が増える段(3・6・10)は、企画ページと同じくかぼちゃ色の縁で目印にする
 * - 押すと企画ページへ(進み具合のくわしい見方と注意書きは、企画ページにある)
 *
 * 数は企画ページの進み具合と同じ(get_hashtag_campaign_progress。エントリー前の投稿も数える)。
 * 出すかどうか(期間中・ログイン中・エントリー済み)は呼び出し側が決める。
 */
export function HomeHalloweenEntryProgress({ usedWorks }: { usedWorks: number }) {
  const works = Math.max(0, usedWorks);
  const filled = Math.min(works, BAR_STEPS);
  const tickets = ticketsForWorks(works, HALLOWEEN_BEST_SHOT.tickets);
  const next = nextTicketTier(works, HALLOWEEN_BEST_SHOT.tickets);

  return (
    <Link
      href={HALLOWEEN_BEST_SHOT.path}
      onClick={() => trackCampaignEvent(CAMPAIGN_EVENTS.homeProgressTap)}
      className="mx-4 mb-3 block sm:mx-0"
      data-testid="home-halloween-entry-progress"
    >
      <p className="mb-1.5 flex flex-wrap gap-x-2 text-xs font-bold text-slate-700">
        <span className="whitespace-nowrap text-green-700">✓ エントリー中</span>
        <span className="whitespace-nowrap" data-testid="home-halloween-entry-progress-now">
          現在 {works}作品({tickets}口)
        </span>
        <span className="whitespace-nowrap text-pink-600" data-testid="home-halloween-entry-progress-next">
          {next
            ? `あと${next.works - works}作品で${next.tickets}口！`
            : `${MAX_TICKETS}口達成！おめでとうございます🎉`}
        </span>
      </p>
      <div
        role="progressbar"
        aria-label={`${HALLOWEEN_BEST_SHOT.prizeCategories.enjoy.name}の抽選の進み具合`}
        aria-valuemin={0}
        aria-valuemax={BAR_STEPS}
        aria-valuenow={filled}
        aria-valuetext={`${BAR_STEPS}作品中${filled}作品(${tickets}口)`}
        // 薄い枠(2026-10-17 ユーザー決定。企画ページと同じ濃い紫の枠は、細いと黒い線に見えた)
        className="grid grid-cols-10 gap-0.5 rounded-full border border-[#e4d7ec] bg-white p-0.5"
      >
        {Array.from({ length: BAR_STEPS }, (_, index) => {
          const isGoal = HALLOWEEN_BEST_SHOT.tickets.some((tier) => tier.works === index + 1);
          return (
            <span
              key={index}
              className="h-2 rounded-full"
              data-filled={index < filled ? "true" : "false"}
              data-goal={isGoal ? "true" : undefined}
              // 企画ページの進み具合と同じ色(halloween.module.css の barCell)
              style={{
                background:
                  index < filled
                    ? "linear-gradient(180deg, #ffb057 0%, #ff7a1a 100%)"
                    : "rgba(61, 16, 80, 0.08)",
                boxShadow: isGoal ? "inset 0 0 0 2px #ffc23d" : undefined,
              }}
            />
          );
        })}
      </div>
    </Link>
  );
}
