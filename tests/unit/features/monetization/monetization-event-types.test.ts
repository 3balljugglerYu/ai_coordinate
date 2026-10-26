/**
 * 画面から送られる、課金の手前の出来事の確かめ方。
 * 画面から送れるのは「足りなくなった」「購入画面を見た」だけ。支払いの開始・期限切れはサーバーだけが書く。
 */

import { parseClientMonetizationEvent } from "@/features/monetization/lib/monetization-event-types";

describe("parseClientMonetizationEvent", () => {
  test("足りなくなった(場所・量つき)を受け付ける", () => {
    expect(
      parseClientMonetizationEvent({
        eventType: "percoin_shortage",
        feature: "generate",
        required: 20,
        balance: 5,
      }),
    ).toEqual({ eventType: "percoin_shortage", feature: "generate", origin: null, required: 20, balance: 5 });
  });

  test("購入画面を見た(表示元つき)を受け付ける", () => {
    expect(parseClientMonetizationEvent({ eventType: "purchase_view", origin: "balance_empty_modal" })).toEqual({
      eventType: "purchase_view",
      feature: null,
      origin: "balance_empty_modal",
      required: null,
      balance: null,
    });
  });

  test.each([
    ["支払いの開始は画面から送れない", { eventType: "checkout_start" }],
    ["期限切れも画面から送れない", { eventType: "checkout_expired" }],
    ["決まっていない種類", { eventType: "checkout_cancel" }],
    ["足りなくなったのに場所が無い", { eventType: "percoin_shortage" }],
    ["決まっていない場所", { eventType: "percoin_shortage", feature: "video" }],
    ["量がマイナス", { eventType: "percoin_shortage", feature: "generate", balance: -1 }],
    ["量が小数", { eventType: "percoin_shortage", feature: "generate", required: 1.5 }],
    ["量が大きすぎる", { eventType: "percoin_shortage", feature: "generate", required: 1_000_001 }],
    ["表示元に記号", { eventType: "purchase_view", origin: "a b" }],
    ["表示元が長すぎる", { eventType: "purchase_view", origin: "a".repeat(65) }],
    ["本文が配列", []],
    ["本文が null", null],
  ])("%s は断る", (_label, body) => {
    expect(parseClientMonetizationEvent(body)).toBeNull();
  });

  test("本文の user_id は使わない(返す値に入らない)", () => {
    const parsed = parseClientMonetizationEvent({
      eventType: "purchase_view",
      userId: "someone-else",
      user_id: "someone-else",
    });
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!)).not.toContain("userId");
    expect(Object.keys(parsed!)).not.toContain("user_id");
  });
});
