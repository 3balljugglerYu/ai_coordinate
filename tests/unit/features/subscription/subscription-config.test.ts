import {
  blocksNewSubscriptionCheckout,
  isActiveSubscriptionStatus,
} from "@/features/subscription/subscription-config";

describe("subscription-config", () => {
  test("checkout は既存契約を解決すべき status をブロックする", () => {
    expect(blocksNewSubscriptionCheckout("trialing")).toBe(true);
    expect(blocksNewSubscriptionCheckout("active")).toBe(true);
    expect(blocksNewSubscriptionCheckout("past_due")).toBe(true);
    expect(blocksNewSubscriptionCheckout("unpaid")).toBe(true);
    expect(blocksNewSubscriptionCheckout("paused")).toBe(true);
  });

  test("checkout は inactive / terminal status を再加入可能として扱う", () => {
    expect(blocksNewSubscriptionCheckout("inactive")).toBe(false);
    expect(blocksNewSubscriptionCheckout("canceled")).toBe(false);
    expect(blocksNewSubscriptionCheckout("incomplete")).toBe(false);
    expect(blocksNewSubscriptionCheckout("incomplete_expired")).toBe(false);
  });

  test("特典適用中 status 判定は active と trialing のまま維持する", () => {
    expect(isActiveSubscriptionStatus("trialing")).toBe(true);
    expect(isActiveSubscriptionStatus("active")).toBe(true);
    expect(isActiveSubscriptionStatus("past_due")).toBe(false);
    expect(isActiveSubscriptionStatus("paused")).toBe(false);
  });
});
