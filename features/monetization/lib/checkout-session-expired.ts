import "server-only";

import type Stripe from "stripe";
import { isUuid } from "@/lib/is-uuid";
import { recordMonetizationEvent } from "./record-monetization-event";


/**
 * Stripe の checkout.session.expired(支払い画面が使われないまま期限切れ = 途中でやめた)を記録する。
 *
 * - 人は支払い画面に入れた client_reference_id で決める(webhook にはセッションが無い)。
 * - 同じ支払い画面の2回目(Stripe の送り直し)は、DB の一意の索引で止まる。
 * - 戻り値: 人が分からず記録しなかったら null、記録を試したら書けたかどうか。
 */
export async function recordCheckoutSessionExpired(
  session: Pick<Stripe.Checkout.Session, "id" | "client_reference_id" | "mode" | "metadata">,
  recordFn: typeof recordMonetizationEvent = recordMonetizationEvent,
): Promise<boolean | null> {
  const userId = session.client_reference_id;
  if (!userId || !isUuid(userId)) return null;

  const metadata = session.metadata ?? {};
  const product =
    session.mode === "subscription"
      ? // 支払いの開始(subscription/checkout)と同じ書き方にする
        `subscription:${metadata.plan ?? "unknown"}:${metadata.billingInterval ?? "unknown"}`
      : (metadata.packageId ?? null);

  return recordFn({
    userId,
    eventType: "checkout_expired",
    origin: metadata.origin ?? null,
    product,
    stripeSessionId: session.id,
  });
}
