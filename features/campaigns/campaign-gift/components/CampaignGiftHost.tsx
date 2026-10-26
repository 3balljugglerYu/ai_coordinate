"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthUser } from "@/features/auth/hooks/use-auth-user";
import { useHalloweenCampaignOpen } from "@/features/campaigns/halloween/hooks/useHalloweenCampaignOpen";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";
import { isTutorialTourInProgress } from "@/features/tutorial/lib/tutorial-status";
import { stripLocalePrefix } from "@/i18n/config";
import {
  formatCampaignGiftExpire,
  HALLOWEEN_GIFT_KEY,
  isCampaignGiftExcludedPath,
  readCampaignGiftDismissed,
  shouldShowCampaignGift,
  writeCampaignGiftDismissed,
  type CampaignGiftClaimResult,
  type CampaignGiftStatus,
} from "../campaign-gift";
import { CampaignGiftModal } from "./CampaignGiftModal";

/**
 * 企画の贈り物を、受け取っていない人に1回だけ出す(どのページでも。2026-10-26 ユーザー決定)。
 *
 * - 企画の期間中で、日本語の画面のときだけ(企画は国内向け)。受け付けの期間の正本は DB(GET の open)
 * - ログインまわり・管理画面・購入の画面では出さない
 * - この端末で閉じたら、もう出さない(人ごとに覚える。ログインしていないときに閉じても、ログインしたあとはもう一度出る)。
 *   受け取りの途中・受け取れなかったときに閉じたら、覚えない(次にページを開いたとき、もう一度出る)
 * - ほかのモーダルが出ている間・チュートリアルの途中は待つ(口数のお祝いと同じく 0.5 秒ごと・最大 60 秒)
 */

const OPEN_DELAY_MS = 800;
const RETRY_MS = 500;
const MAX_WAIT_MS = 60_000;

async function fetchStatus(): Promise<CampaignGiftStatus | null> {
  const response = await fetch(`/api/campaign-gifts/${HALLOWEEN_GIFT_KEY}`, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as CampaignGiftStatus;
}

async function postClaim(): Promise<CampaignGiftClaimResult> {
  const response = await fetch(`/api/campaign-gifts/${HALLOWEEN_GIFT_KEY}`, { method: "POST" });
  // 画面ではログイン中に見えても、サーバーではログインが切れていることがある。ログインし直してもらう
  if (response.status === 401) return { status: "auth_required" };
  if (!response.ok) return { status: "error" };
  return (await response.json()) as CampaignGiftClaimResult;
}

/** 取ってきた状態と、それがだれのものか(ログインの状態が変わったら、聞き直す) */
type StatusFor = { status: CampaignGiftStatus; userId: string | null };

export function CampaignGiftHost() {
  const isCampaignOpen = useHalloweenCampaignOpen();
  const auth = useAuthUser();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [current, setCurrent] = useState<StatusFor | null>(null);
  const [open, setOpen] = useState(false);
  // 覚えずに閉じた(受け取れなかった)ページ。同じページにいる間は出し直さず、別のページを開いたら出す
  const [snoozedPath, setSnoozedPath] = useState<string | null>(null);

  const userId = auth.status === "signed-in" ? auth.user.id : null;
  const excluded = isCampaignGiftExcludedPath(stripLocalePrefix(pathname).pathname);
  // 開いている間にログイン・ログアウトしたら、前の人の状態のまま出さない(閉じて、聞き直す)
  const visible = open && current !== null && current.userId === userId && auth.status !== "loading";

  useEffect(() => {
    if (!isCampaignOpen || auth.status === "loading" || excluded || visible) return;
    if (snoozedPath === pathname) return;
    if (readCampaignGiftDismissed(HALLOWEEN_GIFT_KEY, userId)) return;

    let cancelled = false;
    let timer: number | undefined;

    void fetchStatus()
      .then((next) => {
        if (cancelled || !next) return;
        if (next.claimed) {
          // ほかの端末で受け取った。この端末でも、もう聞きに行かない
          writeCampaignGiftDismissed(HALLOWEEN_GIFT_KEY, userId);
          return;
        }
        if (!shouldShowCampaignGift({ status: next, dismissed: readCampaignGiftDismissed(HALLOWEEN_GIFT_KEY, userId) })) {
          return;
        }
        let waited = 0;
        const tryOpen = () => {
          if (cancelled) return;
          if (document.querySelector('[role="dialog"]') || isTutorialTourInProgress()) {
            waited += RETRY_MS;
            if (waited > MAX_WAIT_MS) return;
            timer = window.setTimeout(tryOpen, RETRY_MS);
            return;
          }
          setCurrent({ status: next, userId });
          setOpen(true);
          trackCampaignEvent(CAMPAIGN_EVENTS.giftView);
        };
        timer = window.setTimeout(tryOpen, OPEN_DELAY_MS);
      })
      .catch(() => {
        // 読めなければ出さない(次にページを開いたときに、もう一度聞く)
      });

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [isCampaignOpen, auth.status, userId, excluded, visible, snoozedPath, pathname]);

  /**
   * 閉じた。remember=false(受け取りの途中・受け取れなかった)のときは覚えない。
   * 覚えると、受け取れていないのに、この端末ではもう出なくなるため
   */
  const handleClose = useCallback(
    (remember: boolean) => {
      setOpen(false);
      if (remember) {
        writeCampaignGiftDismissed(HALLOWEEN_GIFT_KEY, current?.userId ?? userId);
      } else {
        setSnoozedPath(pathname);
      }
    },
    [current, userId, pathname],
  );

  const handleClaimed = useCallback(() => {
    writeCampaignGiftDismissed(HALLOWEEN_GIFT_KEY, userId);
    // 残高を出している画面を新しくする
    router.refresh();
  }, [router, userId]);

  // 閉じたら画面ごと消す(次に開いたとき、前のタップや「受け取りました」を持ち越さない)
  if (!visible || !current) return null;
  const { status } = current;

  return (
    <CampaignGiftModal
      key={current.userId ?? "guest"}
      open
      onClose={handleClose}
      signedIn={status.signedIn}
      amount={status.amount ?? 0}
      expireLabel={formatCampaignGiftExpire(status.expireAt)}
      onClaim={postClaim}
      onClaimed={handleClaimed}
      loginHref={`/login?redirect=${encodeURIComponent(`${pathname}${typeof window === "undefined" ? "" : window.location.search}`)}`}
      worksHref={HALLOWEEN_BEST_SHOT.catalogHref}
    />
  );
}
