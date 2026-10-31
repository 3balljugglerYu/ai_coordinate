"use client";

import type { ReactNode } from "react";
import { trackCampaignEvent, type CampaignEventName } from "@/features/campaigns/lib/campaign-events";
import styles from "../autumn-moment.module.css";

/**
 * 詳しい手順。最初は閉じておき、押して開く(ハロウィン企画と同じ。いきなり手順を並べると嫌気がさすため)。
 * 開いたら GA4 に送る(どの手順まで読まれたかを見るため)。
 */
export function JoinDetails({
  eventName,
  summary,
  children,
}: {
  eventName: CampaignEventName;
  summary: string;
  children: ReactNode;
}) {
  return (
    <details
      className={styles.joinDetails}
      data-testid="autumn-moment-join-details"
      onToggle={(event) => {
        if (event.currentTarget.open) trackCampaignEvent(eventName);
      }}
    >
      <summary className={styles.joinDetailsSummary}>
        {summary}
        <span className={styles.joinDetailsChevron} aria-hidden="true">
          ▼
        </span>
      </summary>
      <div className={styles.joinDetailsBody}>{children}</div>
    </details>
  );
}
