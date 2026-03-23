/** @jest-environment node */

import type { PercoinPackage } from "@/features/credits/percoin-packages";
import {
  deductPercoins,
  InsufficientPercoinBalanceError,
  recordMockPercoinPurchase,
  recordPercoinPurchase,
} from "@/features/credits/lib/percoin-service";

function createSupabaseWithRpc(rpcImpl: jest.Mock) {
  return {
    rpc: rpcImpl,
  } as never;
}

describe("percoin-service", () => {
  const userId = "user-1";
  let rpc: jest.Mock;

  beforeEach(() => {
    rpc = jest.fn();
  });

  test("recordPercoinPurchase_RPC成功の場合_balanceを返しpurchase_paidで呼ぶ", async () => {
    // Spec: PERC-001
    rpc.mockResolvedValue({
      data: [{ balance: 100, from_promo: 0, from_paid: 100 }],
      error: null,
    });

    const result = await recordPercoinPurchase({
      userId,
      percoinAmount: 50,
      metadata: { source: "webhook" },
      stripePaymentIntentId: "pi_123",
      supabaseClient: createSupabaseWithRpc(rpc),
    });

    expect(result).toEqual({ balance: 100 });
    expect(rpc).toHaveBeenCalledWith("apply_percoin_transaction", {
      p_user_id: userId,
      p_amount: 50,
      p_mode: "purchase_paid",
      p_metadata: { source: "webhook", bucket: "paid" },
      p_stripe_payment_intent_id: "pi_123",
      p_related_generation_id: null,
    });
  });

  test("recordMockPercoinPurchase_パッケージ指定の場合_プロモモードとパッケージmetadataで呼ぶ", async () => {
    // Spec: PERC-002
    rpc.mockResolvedValue({
      data: [{ balance: 20, from_promo: 20, from_paid: 0 }],
      error: null,
    });

    const pkg: PercoinPackage = {
      id: "pkg-1",
      name: "Test",
      credits: 20,
      priceYen: 500,
      stripePriceIdTest: "price_test",
      stripePriceIdLive: "price_live",
    };

    const result = await recordMockPercoinPurchase({
      userId,
      percoinPackage: pkg,
      supabaseClient: createSupabaseWithRpc(rpc),
    });

    expect(result).toEqual({ balance: 20 });
    expect(rpc).toHaveBeenCalledWith("apply_percoin_transaction", {
      p_user_id: userId,
      p_amount: 20,
      p_mode: "purchase_promo",
      p_metadata: {
        mode: "mock",
        packageId: "pkg-1",
        priceYen: 500,
        bucket: "promo",
      },
      p_stripe_payment_intent_id: null,
      p_related_generation_id: null,
    });
  });

  test("deductPercoins_数量指定の場合_consumptionモードで呼ぶ", async () => {
    // Spec: PERC-003
    rpc.mockResolvedValue({
      data: [{ balance: 80, from_promo: 10, from_paid: 70 }],
      error: null,
    });

    const result = await deductPercoins({
      userId,
      percoinAmount: 5,
      metadata: { reason: "gen" },
      relatedGenerationId: "gen-1",
      supabaseClient: createSupabaseWithRpc(rpc),
    });

    expect(result).toEqual({ balance: 80 });
    expect(rpc).toHaveBeenCalledWith("apply_percoin_transaction", {
      p_user_id: userId,
      p_amount: 5,
      p_mode: "consumption",
      p_metadata: { reason: "gen" },
      p_stripe_payment_intent_id: null,
      p_related_generation_id: "gen-1",
    });
  });

  test("deductPercoins_残高不足RPCの場合_InsufficientPercoinBalanceErrorを投げる", async () => {
    // Spec: PERC-004
    rpc.mockResolvedValue({
      data: null,
      error: { message: "insufficient balance for user" },
    });

    await expect(
      deductPercoins({
        userId,
        percoinAmount: 999,
        supabaseClient: createSupabaseWithRpc(rpc),
      }),
    ).rejects.toBeInstanceOf(InsufficientPercoinBalanceError);
  });

  test("recordPercoinPurchase_RPC失敗の場合_ラップされたErrorを投げる", async () => {
    // Spec: PERC-005
    rpc.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(
      recordPercoinPurchase({
        userId,
        percoinAmount: 1,
        supabaseClient: createSupabaseWithRpc(rpc),
      }),
    ).rejects.toThrow("ペルコイン取引に失敗しました: permission denied");
  });

  test("recordPercoinPurchase_RPCデータ空の場合_結果未取得Errorを投げる", async () => {
    // Spec: PERC-006
    rpc.mockResolvedValue({
      data: [],
      error: null,
    });

    await expect(
      recordPercoinPurchase({
        userId,
        percoinAmount: 1,
        supabaseClient: createSupabaseWithRpc(rpc),
      }),
    ).rejects.toThrow("ペルコイン取引の結果が取得できませんでした");
  });
});
