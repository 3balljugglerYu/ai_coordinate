"use client";

import type { StylePublicUsageEventType } from "@/features/style/lib/style-usage-events";

interface StyleUsageClientPayload {
  eventType: StylePublicUsageEventType;
  styleId?: string | null;
  /**
   * 企画単位の集計キー。visit のように style_id だけでは企画に紐づかない
   * イベントを数えるために送る。
   * viewer_key は**送らない**(偽装できるためサーバー側で解決する)。
   */
  categoryKey?: string | null;
}

export async function recordStyleUsageClientEvent({
  eventType,
  styleId = null,
  categoryKey = null,
}: StyleUsageClientPayload): Promise<void> {
  const response = await fetch("/style/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      eventType,
      styleId,
      categoryKey,
    }),
    keepalive: true,
  });

  if (!response.ok) {
    throw new Error("Failed to record style usage event.");
  }
}
