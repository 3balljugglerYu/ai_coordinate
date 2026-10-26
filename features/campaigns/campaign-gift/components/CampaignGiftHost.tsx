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
 * - この端末で閉じたら、もう出さない(人ごとに覚える。ログインしていないときに閉じても、ログインしたあとはもう一度出る)
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
  if (!response.ok) return { status: "error" };
  return (await response.json()) as CampaignGiftClaimResult;
}

export function CampaignGiftHost() {
  const isCampaignOpen = useHalloweenCampaignOpen();
  const auth = useAuthUser();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [status, setStatus] = useState<CampaignGiftStatus | null>(null);
  const [open, setOpen] = useState(false);

  const userId = auth.status === "signed-in" ? auth.user.id : null;
  const excluded = isCampaignGiftExcludedPath(stripLocalePrefix(pathname).pathname);

  useEffect(() => {
    if (!isCampaignOpen || auth.status === "loading" || excluded || open) return;
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
          setStatus(next);
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
  }, [isCampaignOpen, auth.status, userId, excluded, open]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) writeCampaignGiftDismissed(HALLOWEEN_GIFT_KEY, userId);
    },
    [userId],
  );

  const handleClaimed = useCallback(() => {
    writeCampaignGiftDismissed(HALLOWEEN_GIFT_KEY, userId);
    // 残高を出している画面を新しくする
    router.refresh();
  }, [router, userId]);

  if (!status) return null;

  return (
    <CampaignGiftModal
      open={open}
      onOpenChange={handleOpenChange}
      signedIn={status.signedIn}
      amount={status.amount ?? 0}
      expireLabel={formatCampaignGiftExpire(status.expireAt)}
      onClaim={postClaim}
      onClaimed={handleClaimed}
      loginHref={`/login?next=${encodeURIComponent(pathname)}`}
      worksHref={HALLOWEEN_BEST_SHOT.catalogHref}
    />
  );
}
