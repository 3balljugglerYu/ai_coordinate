"use client";

import type { ReactNode } from "react";
import { trackCampaignEvent, type CampaignEventName } from "@/features/campaigns/lib/campaign-events";
import styles from "../halloween.module.css";

/**
 * 詳しい作成手順。最初は閉じておき、「詳細な作成手順はこちら！」で開く(2026-10-16 ユーザー指示)。
 * 開いたら GA4 に送る(どの部門の手順まで読まれたかを見るため)。
 */
export function JoinDetails({ eventName, children }: { eventName: CampaignEventName; children: ReactNode }) {
  return (
    <details
      className={styles.joinDetails}
      data-testid="halloween-join-details"
      onToggle={(event) => {
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
