"use client";

import type { StyleUsageEventType } from "@/features/style/lib/style-usage-events";

interface StyleUsageClientPayload {
  eventType: StyleUsageEventType;
  styleId?: string | null;
}

export async function recordStyleUsageClientEvent({
  eventType,
  styleId = null,
}: StyleUsageClientPayload): Promise<void> {
  const response = await fetch("/style/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      eventType,
      styleId,
    }),
    keepalive: true,
  });

  if (!response.ok) {
    throw new Error("Failed to record style usage event.");
  }
}
