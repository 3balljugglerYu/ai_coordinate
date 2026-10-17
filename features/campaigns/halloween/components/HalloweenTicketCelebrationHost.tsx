"use client";

import {
  Component,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ticketsForWorks,
  type HashtagCampaignProgressResponse,
} from "@/features/campaigns/hashtag-campaign/progress";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";
import { HALLOWEEN_BEST_SHOT as CAMPAIGN, isHalloweenBestShotOpen } from "../halloween-best-shot";
import {
  getTicketCelebrationRequestCount,
  getTicketCelebrationRequestServerCount,
  subscribeTicketCelebrationRequests,
} from "../lib/ticket-celebration-requests";
import { HalloweenTicketCelebrationModal } from "./HalloweenTicketCelebrationModal";

/**
 * ハロウィン企画の口数のお祝い(1口・2口・3口に届いたとき、1回ずつ。2026-10-17 ユーザー決定)。
 *
 * ## ミッションクリアのモーダルと重ねない
 *
 * 投稿のあとには、もらえた回だけ「ミッションクリア！」(PostBonusModal)が出る。
 * お祝いはそのあと。PostProgressHost が、ミッションクリアを出している間は `blocked` を渡す。
 * さらに、どんなモーダルでも開いている間は出さない(ホームのポップアップ・拡大表示など。
 * HomeViewSwitchNotice・ModelSwitchNotice と同じ確かめ方)。2枚が同時に開くことはない。
 *
 * ## 1口ごとに1回
 *
 * どこまで出したかは DB(hashtag_campaign_entries.celebrated_tickets)に残す。別の端末でも、
 * 同じ口数のお祝いは二度出さない。数が減ってまた届いても出さない(列の決まり)。
 *
 * ## 失敗しても、ほかを止めない
 *
 * 読めない・記録できないときは何も出さない。描くときに落ちても、外側(ミッションクリアや
 * 投稿の進み具合)を巻き込まないよう、ここで受け止める。
 */

const PROGRESS_URL = `/api/hashtag-campaigns/${CAMPAIGN.campaignKey}/progress`;
const CELEBRATION_URL = `/api/hashtag-campaigns/${CAMPAIGN.campaignKey}/celebration`;

/** ほかのモーダルが閉じてから出すまでの間(閉じる動きの 200ms を見届けてから) */
export const CELEBRATION_OPEN_DELAY_MS = 400;
/** ほかのモーダルが開いている間、確かめ直す間隔 */
export const CELEBRATION_RETRY_MS = 500;
/** 待つのはここまで。閉じられないまま1分たったら、この回は出さない(次の合図でまた確かめる) */
export const CELEBRATION_MAX_WAIT_MS = 60_000;

interface PendingCelebration {
  /** 届いた口数 */
  tickets: number;
  /** 使ったちがう対象作品の数 */
  usedWorks: number;
}

async function readPendingCelebration(): Promise<PendingCelebration | null> {
  try {
    const response = await fetch(PROGRESS_URL, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as HashtagCampaignProgressResponse;
    const viewer = data.viewer;
    // 抽選の口数なので、エントリーした人だけ
    if (!viewer?.enteredAt) return null;
    const usedWorks = Math.max(0, viewer.usedWorks);
    const tickets = ticketsForWorks(usedWorks, CAMPAIGN.tickets);
    if (tickets <= viewer.celebratedTickets) return null;
    return { tickets, usedWorks };
  } catch {
    return null;
  }
}

async function recordCelebration(tickets: number): Promise<void> {
  try {
    await fetch(CELEBRATION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickets }),
    });
  } catch {
    // 記録できなくても、このタブでは二度出さない(shownTicketsRef)。ほかの端末ではもう一度出ることがある
  }
}

function TicketCelebration({ blocked }: { blocked: boolean }) {
  const requestCount = useSyncExternalStore(
    subscribeTicketCelebrationRequests,
    getTicketCelebrationRequestCount,
    getTicketCelebrationRequestServerCount,
  );
  const [pending, setPending] = useState<PendingCelebration | null>(null);
  const [open, setOpen] = useState(false);
  /** このタブで出した口数。記録が失敗しても、同じ口数は二度出さない */
  const shownTicketsRef = useRef(0);

  // 合図が来たら、口数が増えたかを確かめる(期間中だけ)
  useEffect(() => {
    if (requestCount === 0 || !isHalloweenBestShotOpen(Date.now())) return;
    let cancelled = false;
    void readPendingCelebration().then((next) => {
      // 次の合図が来たら、古い結果は捨てる(新しいほうで確かめ直している)
      if (cancelled || !next || next.tickets <= shownTicketsRef.current) return;
      setPending(next);
    });
    return () => {
      cancelled = true;
    };
  }, [requestCount]);

  // ほかのモーダルが閉じてから出す
  useEffect(() => {
    if (!pending || open || blocked) return;
    let timer: number | undefined;
    let waitedMs = 0;
    const tryOpen = () => {
      if (document.querySelector('[role="dialog"]')) {
        waitedMs += CELEBRATION_RETRY_MS;
        if (waitedMs > CELEBRATION_MAX_WAIT_MS) return;
        timer = window.setTimeout(tryOpen, CELEBRATION_RETRY_MS);
        return;
      }
      shownTicketsRef.current = pending.tickets;
      setOpen(true);
    };
    timer = window.setTimeout(tryOpen, CELEBRATION_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending, open, blocked]);

  // 出せたら(画面に描けたら)、出したことを残す。描けずに落ちたときは残さない
  useEffect(() => {
    if (!open || !pending) return;
    void recordCelebration(pending.tickets);
    trackCampaignEvent(CAMPAIGN_EVENTS.celebrationView);
  }, [open, pending]);

  if (!pending || !open) return null;
  return (
    <HalloweenTicketCelebrationModal
      open
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
          setPending(null);
        }
      }}
      tickets={pending.tickets}
      usedWorks={pending.usedWorks}
    />
  );
}

/** お祝いが描くときに落ちても、外側(ミッションクリア・投稿の進み具合)は描き続ける */
class IsolateCelebrationFailure extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Halloween ticket celebration failed", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function HalloweenTicketCelebrationHost({ blocked }: { blocked: boolean }) {
  return (
    <IsolateCelebrationFailure>
      <TicketCelebration blocked={blocked} />
    </IsolateCelebrationFailure>
  );
}
