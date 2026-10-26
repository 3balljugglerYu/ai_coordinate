/** @jest-environment node */

/**
 * 課金の手前の出来事を書く関数。
 * ⚠️ 失敗しても投げないこと(生成や支払いの本来の処理を、記録のせいで止めない)。
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordMonetizationEvent } from "@/features/monetization/lib/record-monetization-event";
import { recordCheckoutSessionExpired } from "@/features/monetization/lib/checkout-session-expired";

const USER = "11111111-1111-4111-8111-111111111111";

function rpcClient(result: unknown) {
  const rpc = jest.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordMonetizationEvent", () => {
  test("RPC に値を渡し、書けたら true", async () => {
    const { client, rpc } = rpcClient({ data: true, error: null });
    await expect(
      recordMonetizationEvent(
        { userId: USER, eventType: "checkout_start", origin: "purchase_page", product: "p100", stripeSessionId: "cs_1" },
        client,
      ),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("record_monetization_event", {
      p_user_id: USER,
      p_event_type: "checkout_start",
      p_feature: null,
      p_where_detected: null,
      p_origin: "purchase_page",
      p_product: "p100",
      p_required: null,
      p_balance: null,
      p_stripe_session_id: "cs_1",
    });
  });

  test("DB が書かなかったとき(上限・2回目)は false", async () => {
    const { client } = rpcClient({ data: false, error: null });
    await expect(recordMonetizationEvent({ userId: USER, eventType: "purchase_view" }, client)).resolves.toBe(false);
  });

  test("エラーが返っても投げずに false", async () => {
    const { client } = rpcClient({ data: null, error: { message: "boom" } });
    await expect(recordMonetizationEvent({ userId: USER, eventType: "purchase_view" }, client)).resolves.toBe(false);
  });

  test("呼び出しが投げても、投げずに false", async () => {
    const { client } = rpcClient(new Error("network"));
    await expect(recordMonetizationEvent({ userId: USER, eventType: "purchase_view" }, client)).resolves.toBe(false);
  });
});

describe("recordCheckoutSessionExpired", () => {
  test("ペルコインの支払い画面: 人は client_reference_id、商品は packageId", async () => {
    const recordFn = jest.fn(async () => true);
    await expect(
      recordCheckoutSessionExpired(
        { id: "cs_1", client_reference_id: USER, mode: "payment", metadata: { packageId: "p100", origin: "purchase_page" } },
        recordFn,
      ),
    ).resolves.toBe(true);
    expect(recordFn).toHaveBeenCalledWith({
      userId: USER,
      eventType: "checkout_expired",
      origin: "purchase_page",
      product: "p100",
      stripeSessionId: "cs_1",
    });
  });

  test("サブスクの支払い画面: 商品は subscription:<プラン>", async () => {
    const recordFn = jest.fn(async () => true);
    await recordCheckoutSessionExpired(
      { id: "cs_2", client_reference_id: USER, mode: "subscription", metadata: { plan: "light" } },
      recordFn,
    );
    expect(recordFn).toHaveBeenCalledWith(expect.objectContaining({ product: "subscription:light", origin: null }));
  });

  test.each([
    ["client_reference_id が無い", null],
    ["UUID でない", "not-a-uuid"],
  ])("%s なら記録しない(null)", async (_label, ref) => {
    const recordFn = jest.fn(async () => true);
    await expect(
      recordCheckoutSessionExpired({ id: "cs_3", client_reference_id: ref, mode: "payment", metadata: {} }, recordFn),
    ).resolves.toBeNull();
    expect(recordFn).not.toHaveBeenCalled();
  });
});
