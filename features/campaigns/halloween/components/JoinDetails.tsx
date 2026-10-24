"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { trackCampaignEvent, type CampaignEventName } from "@/features/campaigns/lib/campaign-events";
import { subscribeJoinGuideRequests } from "../lib/join-guide-requests";
import styles from "../halloween.module.css";

/**
 * 詳しい作成手順。最初は閉じておき、「詳細な作成手順はこちら！」で開く(2026-10-16 ユーザー指示)。
 * 開いたら GA4 に送る(どの部門の手順まで読まれたかを見るため)。
 * tabKey を渡すと、対象作品の上のカードの「詳しくはこちら」でも開く(join-guide-requests)。
 * そのときは手順を押して開いたのではないので、GA4 には送らない。
 */
export function JoinDetails({
  eventName,
  tabKey,
  children,
}: {
  eventName: CampaignEventName;
  tabKey?: string;
  children: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  /** 合図で開いたとき、続いて届く toggle を GA4 に送らない */
  const openedByRequest = useRef(false);

  useEffect(() => {
    if (!tabKey) return;
    return subscribeJoinGuideRequests((requested) => {
      if (requested !== tabKey || !details.current || details.current.open) return;
      openedByRequest.current = true;
      details.current.open = true;
    });
  }, [tabKey]);

  return (
    <details
      ref={details}
      className={styles.joinDetails}
      data-testid="halloween-join-details"
      onToggle={(event) => {
        if (openedByRequest.current) {
          openedByRequest.current = false;
          return;
        }
        if (event.currentTarget.open) trackCampaignEvent(eventName);
      }}
    >
      <summary className={styles.joinDetailsSummary}>
        詳細な作成手順はこちら！
        <span className={styles.joinDetailsChevron} aria-hidden="true">
          ▼
        </span>
      </summary>
      <div className={styles.joinDetailsBody}>{children}</div>
    </details>
  );
}
