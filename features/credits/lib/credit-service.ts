import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { CreditPackage } from "@/features/credits/credit-packages";

export type CreditTransactionType =
  | "purchase"
  | "consumption"
  | "refund"
  | "signup_bonus"
  | "daily_post"
  | "streak"
  | "referral";

export type CreditTransactionMetadata = Record<string, unknown>;

type Supabase = SupabaseClient<any, "public", any>;

async function ensureCreditAccount(
  supabase: Supabase,
  userId: string
): Promise<{ id: string; balance: number }> {
  const { data, error } = await supabase
    .from("user_credits")
    .select("id, balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`クレジット残高の取得に失敗しました: ${error.message}`);
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
      `クレジットアカウントの初期化に失敗しました: ${insertError?.message}`
    );
  }

  return created;
}

async function updateBalance(
  supabase: Supabase,
  userId: string,
  amount: number
): Promise<number> {
  const account = await ensureCreditAccount(supabase, userId);
  const newBalance = account.balance + amount;

  if (newBalance < 0) {
    throw new Error("クレジット残高が不足しています");
  }

  const { data, error } = await supabase
    .from("user_credits")
    .update({ balance: newBalance })
    .eq("user_id", userId)
    .select("balance")
    .single();

  if (error || !data) {
    throw new Error(`クレジット残高の更新に失敗しました: ${error?.message}`);
  }

  return data.balance;
}

async function insertTransaction(
  supabase: Supabase,
  params: {
    userId: string;
    amount: number;
    transactionType: CreditTransactionType;
    stripePaymentIntentId?: string | null;
    relatedGenerationId?: string | null;
    metadata?: CreditTransactionMetadata;
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

export async function recordCreditPurchase(params: {
  userId: string;
  creditAmount: number;
  metadata?: CreditTransactionMetadata;
  stripePaymentIntentId?: string | null;
  supabaseClient?: Supabase;
}) {
  const supabase =
    params.supabaseClient ?? (await createServerSupabaseClient());
  const balance = await updateBalance(supabase, params.userId, params.creditAmount);

  await insertTransaction(supabase, {
    userId: params.userId,
    amount: params.creditAmount,
    transactionType: "purchase",
    stripePaymentIntentId: params.stripePaymentIntentId,
    metadata: params.metadata,
  });

  return { balance };
}

export async function recordMockCreditPurchase(params: {
  userId: string;
  creditPackage: CreditPackage;
  supabaseClient?: Supabase;
}) {
  return recordCreditPurchase({
    userId: params.userId,
    creditAmount: params.creditPackage.credits,
    supabaseClient: params.supabaseClient,
    metadata: {
      mode: "mock",
      packageId: params.creditPackage.id,
      priceYen: params.creditPackage.priceYen,
    },
  });
}

export async function deductCredits(params: {
  userId: string;
  creditAmount: number;
  transactionType?: Extract<CreditTransactionType, "consumption" | "refund">;
  metadata?: CreditTransactionMetadata;
  relatedGenerationId?: string | null;
  supabaseClient?: Supabase;
}) {
  const supabase =
    params.supabaseClient ?? (await createServerSupabaseClient());
  const balance = await updateBalance(supabase, params.userId, -params.creditAmount);

  await insertTransaction(supabase, {
    userId: params.userId,
    amount: -params.creditAmount,
    transactionType: params.transactionType ?? "consumption",
    relatedGenerationId: params.relatedGenerationId ?? null,
    metadata: params.metadata,
  });

  return { balance };
}
