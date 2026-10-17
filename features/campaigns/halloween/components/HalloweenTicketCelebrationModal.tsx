"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { CollectionConfetti } from "@/features/collections/components/CollectionConfetti";
import { nextTicketTier } from "@/features/campaigns/hashtag-campaign/progress";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";
import { cn } from "@/lib/utils";
import { HALLOWEEN_BEST_SHOT as CAMPAIGN } from "../halloween-best-shot";

/**
 * ハロウィン企画の口数のお祝い(1口・2口・3口に届いたとき。2026-10-17 ユーザー決定)。
 *
 * 見た目は実画面の3案(ミッションクリアとそろえる・ハロウィンの夜・バーが主役)を並べて
 * 「ハロウィンの夜」に決まった。上が夜空の紫、下が白。バーは企画ページと同じ見た目。
 *
 * - 3口(いちばん多い)のときだけ、画面の左右から紙吹雪を出す(10/15 ユーザー「3口は特に派手に」)。
 *   絵文字も 🎃 から 🎉 に変え、「対象作品をもっと見る」は出さない(もう増えないため)
 * - Amazon の名前は出さない。「ゲット」とは書かない(アマギフ企画の決まり)
 */

/** バーの段の数 = 最後の口数に届く作品数(10) */
const BAR_STEPS = Math.max(...CAMPAIGN.tickets.map((tier) => tier.works));
const MAX_TICKETS = Math.max(...CAMPAIGN.tickets.map((tier) => tier.tickets));
/** 紙吹雪は、モーダルが出きってから(フェードイン 200ms のあと) */
const CONFETTI_DELAY_MS = 250;

interface HalloweenTicketCelebrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 届いた口数(1〜3) */
  tickets: number;
  /** 使ったちがう対象作品の数 */
  usedWorks: number;
}

const STYLES = `
@keyframes hbs-cel-pop {
  0% { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.hbs-cel-pop { animation: hbs-cel-pop 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
@media (prefers-reduced-motion: reduce) {
  .hbs-cel-pop { animation: none !important; }
}
`;

/**
 * 開いたときは、ボタンでなくモーダルそのものにフォーカスを置く。企画ページを開いてすぐに出すと、
 * いちばん上のボタンにフォーカスの枠(青い線)が出てしまうため(投稿のあとは、指で押した直後なので出ない)
 */
function focusDialogItself(event: Event) {
  event.preventDefault();
  (event.target as HTMLElement | null)?.focus({ preventScroll: true });
}

function isGoal(works: number) {
  return CAMPAIGN.tickets.some((tier) => tier.works === works);
}

/** 企画ページと同じ見た目のバー + 口数の目印 */
function CampaignBar({ works }: { works: number }) {
  const filled = Math.min(works, BAR_STEPS);
  return (
    <div aria-hidden="true">
      <div className="grid grid-cols-10 gap-1 rounded-full border-2 border-[#e4d7ec] bg-white p-1">
        {Array.from({ length: BAR_STEPS }, (_, index) => (
          <span
            key={index}
            className="h-3 rounded-full"
            data-filled={index < filled ? "true" : "false"}
            style={{
              background:
                index < filled
                  ? "linear-gradient(180deg, #ffb057 0%, #ff7a1a 100%)"
                  : "rgba(61, 16, 80, 0.08)",
              boxShadow: isGoal(index + 1) ? "inset 0 0 0 2px #ffc23d" : undefined,
            }}
          />
        ))}
      </div>
      <div className="mt-1 grid grid-cols-10">
        {CAMPAIGN.tickets.map((tier) => (
          <span
            key={tier.tickets}
            className={cn(
              "justify-self-end whitespace-nowrap text-[11px] font-extrabold",
              works >= tier.works ? "text-[#ff7a1a]" : "text-slate-400",
            )}
            style={{ gridColumn: tier.works }}
          >
            🎃{tier.tickets}口
          </span>
        ))}
      </div>
    </div>
  );
}

function nextLine(works: number) {
  const next = nextTicketTier(works, CAMPAIGN.tickets);
  return next
    ? `あと${next.works - works}作品で${next.tickets}口！`
    : `いちばん多い${MAX_TICKETS}口です。結果発表をお楽しみに！`;
}

const PRIMARY_BUTTON_CLASS =
  "flex min-h-[48px] w-full items-center justify-center rounded-full bg-[linear-gradient(120deg,#ff7a1a,#ffb12e)] text-base font-bold text-white";

function Actions({ works, onOpenChange }: { works: number; onOpenChange: (open: boolean) => void }) {
  const hasNext = nextTicketTier(works, CAMPAIGN.tickets) !== null;
  return (
    <div className="flex flex-col items-center gap-1">
      {hasNext ? (
        <>
          <Link
            href={CAMPAIGN.catalogHref}
            onClick={() => {
              trackCampaignEvent(CAMPAIGN_EVENTS.celebrationCatalog);
              onOpenChange(false);
            }}
            className={PRIMARY_BUTTON_CLASS}
          >
            対象作品をもっと見る
          </Link>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-[40px] px-4 text-sm font-medium text-slate-500"
          >
            閉じる
          </button>
        </>
      ) : (
        <button type="button" onClick={() => onOpenChange(false)} className={PRIMARY_BUTTON_CLASS}>
          閉じる
        </button>
      )}
    </div>
  );
}

export function HalloweenTicketCelebrationModal({
  open,
  onOpenChange,
  tickets,
  usedWorks,
}: HalloweenTicketCelebrationModalProps) {
  const works = Math.max(0, usedWorks);
  const isMax = tickets >= MAX_TICKETS;
  const [showConfetti, setShowConfetti] = useState(false);
  const description = `${CAMPAIGN.prizeCategories.enjoy.name}の抽選に、${tickets}口で参加中です`;

  useEffect(() => {
    if (!open || !isMax) return;
    const timer = window.setTimeout(() => setShowConfetti(true), CONFETTI_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open, isMax]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <style>{STYLES}</style>
      <CollectionConfetti show={showConfetti} />
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-2xl border-0 p-0 outline-none sm:max-w-sm"
        onOpenAutoFocus={focusDialogItself}
        data-testid="halloween-ticket-celebration"
      >
        <div className="relative bg-[linear-gradient(160deg,#2a0a35_0%,#3d1050_65%,#56196b_100%)] px-6 pb-6 pt-7 text-center">
          <DialogClose
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-white/70"
            aria-label="閉じる"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden
              className="h-4 w-4"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </DialogClose>
          <div className="hbs-cel-pop text-5xl leading-none" aria-hidden="true">
            {isMax ? "🎉" : "🎃"}
          </div>
          <p className="mt-3 text-xs font-bold text-[#ffc23d]">ハロウィン企画</p>
          <DialogTitle className="mt-1 text-3xl font-black text-white">
            <span className="text-[#ffc23d]">{tickets}口</span>達成！
          </DialogTitle>
        </div>
        {/* 狭い幅(320px)で「参加中／です」のように言葉の途中で折れないよう、「、」「。」の後ろでだけ折り返す(企画ページと同じ) */}
        <div className="space-y-3 px-5 pb-4 pt-4 [overflow-wrap:anywhere] [word-break:keep-all]">
          <DialogDescription className="text-center text-sm text-slate-700">
            {description}
          </DialogDescription>
          <CampaignBar works={works} />
          <div className="space-y-0.5 text-center">
            <p className="text-xs text-slate-500">ちがう対象作品を{works}作品使いました</p>
            <p className="text-sm font-bold text-pink-600">{nextLine(works)}</p>
          </div>
          <Actions works={works} onOpenChange={onOpenChange} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
