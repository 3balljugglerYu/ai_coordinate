import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { PercoinPackage } from "@/features/credits/percoin-packages";

export type PercoinTransactionType =
  | "purchase"
  | "consumption"
  | "refund"
  | "signup_bonus"
  | "daily_post"
  | "streak"
  | "referral"
  | "admin_bonus"
  | "tour_bonus"
  | "forfeiture";

export type PercoinTransactionMetadata = Record<string, unknown>;

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type PercoinTransactionMode = "purchase_paid" | "purchase_promo" | "consumption";

export class InsufficientPercoinBalanceError extends Error {
  constructor() {
    super("ペルコイン残高が不足しています");
    this.name = "InsufficientPercoinBalanceError";
  }
}

interface ApplyPercoinTransactionResult {
  balance: number;
  from_promo: number;
  from_paid: number;
}

async function applyPercoinTransaction(params: {
  supabase: Supabase;
  userId: string;
  amount: number;
  mode: PercoinTransactionMode;
  metadata?: PercoinTransactionMetadata;
  stripePaymentIntentId?: string | null;
  relatedGenerationId?: string | null;
}): Promise<{ balance: number; fromPromo: number; fromPaid: number }> {
  const { data, error } = await params.supabase.rpc("apply_percoin_transaction", {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_mode: params.mode,
    p_metadata: params.metadata ?? null,
    p_stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
    p_related_generation_id: params.relatedGenerationId ?? null,
  });

  if (error) {
    if (error.message.includes("insufficient balance")) {
      throw new InsufficientPercoinBalanceError();
    }
    throw new Error(`ペルコイン取引に失敗しました: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : null) as
    | ApplyPercoinTransactionResult
    | undefined;

  if (!row) {
    throw new Error("ペルコイン取引の結果が取得できませんでした");
  }

  return {
    balance: row.balance,
    fromPromo: row.from_promo,
    fromPaid: row.from_paid,
  };
}

export async function recordPercoinPurchase(params: {
  userId: string;
  percoinAmount: number;
  metadata?: PercoinTransactionMetadata;
  stripePaymentIntentId?: string | null;
  supabaseClient?: Supabase;
}) {
  const supabase =
    params.supabaseClient ?? (await createServerSupabaseClient());

  const result = await applyPercoinTransaction({
    supabase,
    userId: params.userId,
    amount: params.percoinAmount,
    mode: "purchase_paid",
    stripePaymentIntentId: params.stripePaymentIntentId,
    metadata: {
      ...(params.metadata ?? {}),
      bucket: "paid",
    },
  });

  return { balance: result.balance };
}

export async function recordMockPercoinPurchase(params: {
  userId: string;
  percoinPackage: PercoinPackage;
  supabaseClient?: Supabase;
}) {
  const supabase =
    params.supabaseClient ?? (await createServerSupabaseClient());

  const result = await applyPercoinTransaction({
    supabase,
    userId: params.userId,
    amount: params.percoinPackage.credits,
    mode: "purchase_promo",
    metadata: {
      mode: "mock",
      packageId: params.percoinPackage.id,
      priceYen: params.percoinPackage.priceYen,
      bucket: "promo",
    },
  });

  return { balance: result.balance };
}

export async function deductPercoins(params: {
  userId: string;
  percoinAmount: number;
  transactionType?: Extract<PercoinTransactionType, "consumption">;
  metadata?: PercoinTransactionMetadata;
  relatedGenerationId?: string | null;
  supabaseClient?: Supabase;
}) {
  const supabase =
    params.supabaseClient ?? (await createServerSupabaseClient());

  const result = await applyPercoinTransaction({
    supabase,
    userId: params.userId,
    amount: params.percoinAmount,
    mode: "consumption",
    relatedGenerationId: params.relatedGenerationId ?? null,
    metadata: params.metadata,
  });

  return { balance: result.balance };
}
