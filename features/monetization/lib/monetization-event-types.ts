import { purchaseOriginSchema } from "./purchase-origin";

/**
 * 課金の手前の出来事(monetization_events)の種類と、画面から受け取る値の確認(純関数)。
 * 値の一覧は DB の CHECK(20261026050500)とそろえること。
 */

export const MONETIZATION_EVENT_TYPES = [
  "percoin_shortage",
  "purchase_view",
  "checkout_start",
  "checkout_expired",
] as const;
export type MonetizationEventType = (typeof MONETIZATION_EVENT_TYPES)[number];

/** 画面から送れる種類。支払いの開始・期限切れはサーバーだけが書く。 */
export const CLIENT_MONETIZATION_EVENT_TYPES = ["percoin_shortage", "purchase_view"] as const;
export type ClientMonetizationEventType = (typeof CLIENT_MONETIZATION_EVENT_TYPES)[number];

export const MONETIZATION_FEATURES = [
  "generate",
  "style_generate",
  "gacha_split",
  "name_input",
] as const;
export type MonetizationFeature = (typeof MONETIZATION_FEATURES)[number];

export interface ClientMonetizationEventInput {
  eventType: ClientMonetizationEventType;
  feature: MonetizationFeature | null;
  origin: string | null;
  required: number | null;
  balance: number | null;
}

const MAX_AMOUNT = 1_000_000;

function optionalAmount(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_AMOUNT) {
    return undefined;
  }
  return value;
}

/**
 * 画面から送られた本文を確かめる。だめなら null。
 * user_id は受け取らない(サーバーのセッションで決める)。
 */
export function parseClientMonetizationEvent(body: unknown): ClientMonetizationEventInput | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;

  if (!(CLIENT_MONETIZATION_EVENT_TYPES as readonly unknown[]).includes(input.eventType)) {
    return null;
  }
  const eventType = input.eventType as ClientMonetizationEventType;

  let feature: MonetizationFeature | null = null;
  if (input.feature !== undefined && input.feature !== null) {
    if (!(MONETIZATION_FEATURES as readonly unknown[]).includes(input.feature)) return null;
    feature = input.feature as MonetizationFeature;
  }
  // 足りなくなったときは、場所が要る
  if (eventType === "percoin_shortage" && feature === null) return null;

  let origin: string | null = null;
  if (input.origin !== undefined && input.origin !== null) {
    const parsed = purchaseOriginSchema.safeParse(input.origin);
    if (!parsed.success) return null;
    origin = parsed.data;
  }

  const required = optionalAmount(input.required);
  const balance = optionalAmount(input.balance);
  if (required === undefined || balance === undefined) return null;

  return { eventType, feature, origin, required, balance };
}
