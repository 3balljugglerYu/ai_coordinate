"use client";

import { useState } from "react";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";
import styles from "../halloween.module.css";

/** ハッシュタグを写して、投稿の本文にそのまま貼れるようにする。 */
export function CopyHashtagButton({ hashtag }: { hashtag: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hashtag);
      setCopied(true);
      trackCampaignEvent(CAMPAIGN_EVENTS.hashtagCopy);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className={styles.copyButton} onClick={copy}>
      {copied ? "コピーしました！" : "コピーする"}
    </button>
  );
}
