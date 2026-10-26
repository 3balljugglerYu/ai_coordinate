"use client";

import type { ClientMonetizationEventInput } from "./monetization-event-types";

/**
 * 画面から、課金の手前の出来事を送る(POST /api/monetization-events)。
 *
 * - 同じ訪問(タブ)の中では、同じ key で1回だけ送る(sessionStorage)。
 *   再描画や何度も押すたびに数が増えないように。
 * - 「送った」と覚えるのは、2xx が返ったときだけ(未ログインの 401 や通信の失敗では覚えない。
 *   同じタブでログインしてから開き直したときに、記録できるように)。送っている最中の2回目は送らない。
 * - 送れなくても、画面の動きには関係させない(投げない・待たせない)。
 */
const SENT_KEY_PREFIX = "persta_monetization_sent:";

function alreadySent(key: string): boolean {
  try {
    return window.sessionStorage.getItem(SENT_KEY_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function markSent(key: string) {
  try {
    window.sessionStorage.setItem(SENT_KEY_PREFIX + key, "1");
  } catch {
    // 保存できない(プライベートブラウズなど)ときは、毎回送る。上限は DB が数える
  }
}

const inFlight = new Set<string>();

export function trackMonetizationEventOnce(
  key: string,
  event: Partial<ClientMonetizationEventInput> & Pick<ClientMonetizationEventInput, "eventType">,
): void {
  if (typeof window === "undefined") return;
  if (alreadySent(key) || inFlight.has(key)) return;
  inFlight.add(key);
  try {
    void fetch("/api/monetization-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    })
      .then((response) => {
        if (response.ok) markSent(key);
      })
      .catch(() => {})
      .finally(() => inFlight.delete(key));
  } catch {
    // fetch が使えない環境では何もしない
    inFlight.delete(key);
  }
}
