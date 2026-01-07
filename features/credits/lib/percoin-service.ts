import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { PercoinPackage } from "@/features/credits/percoin-packages";

export type PercoinTransactionType =
  | "purchase"
  | "consumption"
  | "refund"
  | "signup_bonus"
  | "daily_post"
  | "streak"
  | "referral";

export type PercoinTransactionMetadata = Record<string, unknown>;

type Supabase = SupabaseClient<any, "public", any>;

async function ensurePercoinAccount(
  supabase: Supabase,
  userId: string
): Promise<{ id: string; balance: number }> {
  const { data, error } = await supabase
    .from("user_credits")
    .select("id, balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`ペルコイン残高の取得に失敗しました: ${error.message}`);
  }

  if (data) {
    return data;
  }

  const { data: created, error: insertError } = await supabase
    .from("user_credits")
    .insert({ user_id: userId, balance: 0 })
    .select("id, balance")
    .single();

  if (insertError || !created) {
    throw new Error(
      `ペルコインアカウントの初期化に失敗しました: ${insertError?.message}`
    );
  }

  return created;
}

async function updatePercoinBalance(
  supabase: Supabase,
  userId: string,
  amount: number
): Promise<number> {
  const account = await ensurePercoinAccount(supabase, userId);
  const newBalance = account.balance + amount;

  if (newBalance < 0) {
    throw new Error("ペルコイン残高が不足しています");
  }

  const { data, error } = await supabase
    .from("user_credits")
    .update({ balance: newBalance })
    .eq("user_id", userId)
    .select("balance")
    .single();

  if (error || !data) {
    throw new Error(`ペルコイン残高の更新に失敗しました: ${error?.message}`);
  }

  return data.balance;
}

async function insertTransaction(
  supabase: Supabase,
  params: {
    userId: string;
    amount: number;
    transactionType: PercoinTransactionType;
    stripePaymentIntentId?: string | null;
    relatedGenerationId?: string | null;
    metadata?: PercoinTransactionMetadata;
  }
) {
  const { error } = await supabase.from("credit_transactions").insert({
    user_id: params.userId,
    amount: params.amount,
    transaction_type: params.transactionType,
    stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
    related_generation_id: params.relatedGenerationId ?? null,
    metadata: params.metadata ?? null,
  });

  if (error) {
    throw new Error(`取引履歴の保存に失敗しました: ${error.message}`);
  }
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
  const balance = await updatePercoinBalance(supabase, params.userId, params.percoinAmount);

  await insertTransaction(supabase, {
    userId: params.userId,
    amount: params.percoinAmount,
    transactionType: "purchase",
    stripePaymentIntentId: params.stripePaymentIntentId,
    metadata: params.metadata,
  });

  return { balance };
}

export async function recordMockPercoinPurchase(params: {
  userId: string;
  percoinPackage: PercoinPackage;
  supabaseClient?: Supabase;
}) {
  return recordPercoinPurchase({
    userId: params.userId,
    percoinAmount: params.percoinPackage.credits,
    supabaseClient: params.supabaseClient,
    metadata: {
      mode: "mock",
      packageId: params.percoinPackage.id,
      priceYen: params.percoinPackage.priceYen,
    },
  });
}

export async function deductPercoins(params: {
  userId: string;
  percoinAmount: number;
  transactionType?: Extract<PercoinTransactionType, "consumption" | "refund">;
  metadata?: PercoinTransactionMetadata;
  relatedGenerationId?: string | null;
  supabaseClient?: Supabase;
}) {
  const supabase =
    params.supabaseClient ?? (await createServerSupabaseClient());
  const balance = await updatePercoinBalance(supabase, params.userId, -params.percoinAmount);

  await insertTransaction(supabase, {
    userId: params.userId,
    amount: -params.percoinAmount,
    transactionType: params.transactionType ?? "consumption",
    relatedGenerationId: params.relatedGenerationId ?? null,
    metadata: params.metadata,
  });

  return { balance };
}
