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
  | "forfeiture";

export type PercoinTransactionMetadata = Record<string, unknown>;

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

interface PercoinAccount {
  id: string;
  balance: number;
  paid_balance: number;
  promo_balance: number;
}

async function ensurePercoinAccount(
  supabase: Supabase,
  userId: string
): Promise<PercoinAccount> {
  const { data, error } = await supabase
    .from("user_credits")
    .select("id, balance, paid_balance, promo_balance")
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
    .insert({ user_id: userId, balance: 0, paid_balance: 0, promo_balance: 0 })
    .select("id, balance, paid_balance, promo_balance")
    .single();

  if (insertError || !created) {
    throw new Error(
      `ペルコインアカウントの初期化に失敗しました: ${insertError?.message}`
    );
  }

  return created;
}

async function addPercoinsToBucket(
  supabase: Supabase,
  userId: string,
  amount: number,
  bucket: "paid" | "promo"
): Promise<number> {
  if (amount < 0) {
    throw new Error("加算額は0以上である必要があります");
  }

  const account = await ensurePercoinAccount(supabase, userId);
  const newPaidBalance =
    bucket === "paid" ? account.paid_balance + amount : account.paid_balance;
  const newPromoBalance =
    bucket === "promo" ? account.promo_balance + amount : account.promo_balance;
  const newBalance = newPaidBalance + newPromoBalance;

  const { data, error } = await supabase
    .from("user_credits")
    .update({
      paid_balance: newPaidBalance,
      promo_balance: newPromoBalance,
      balance: newBalance,
    })
    .eq("user_id", userId)
    .select("balance")
    .single();

  if (error || !data) {
    throw new Error(`ペルコイン残高の更新に失敗しました: ${error?.message}`);
  }

  return data.balance;
}

async function deductPercoinsFromWallet(
  supabase: Supabase,
  userId: string,
  amount: number
): Promise<{ balance: number; fromPromo: number; fromPaid: number }> {
  if (amount <= 0) {
    throw new Error("消費額は1以上である必要があります");
  }

  const account = await ensurePercoinAccount(supabase, userId);
  const fromPromo = Math.min(account.promo_balance, amount);
  const remaining = amount - fromPromo;
  const fromPaid = remaining;

  if (fromPaid > account.paid_balance) {
    throw new Error("ペルコイン残高が不足しています");
  }

  const newPaidBalance = account.paid_balance - fromPaid;
  const newPromoBalance = account.promo_balance - fromPromo;
  const newBalance = newPaidBalance + newPromoBalance;

  const { data, error } = await supabase
    .from("user_credits")
    .update({
      paid_balance: newPaidBalance,
      promo_balance: newPromoBalance,
      balance: newBalance,
    })
    .eq("user_id", userId)
    .select("balance")
    .single();

  if (error || !data) {
    throw new Error(`ペルコイン残高の更新に失敗しました: ${error?.message}`);
  }

  return {
    balance: data.balance,
    fromPromo,
    fromPaid,
  };
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
  const balance = await addPercoinsToBucket(
    supabase,
    params.userId,
    params.percoinAmount,
    "paid"
  );

  await insertTransaction(supabase, {
    userId: params.userId,
    amount: params.percoinAmount,
    transactionType: "purchase",
    stripePaymentIntentId: params.stripePaymentIntentId,
    metadata: {
      ...(params.metadata ?? {}),
      bucket: "paid",
    },
  });

  return { balance };
}

export async function recordMockPercoinPurchase(params: {
  userId: string;
  percoinPackage: PercoinPackage;
  supabaseClient?: Supabase;
}) {
  const supabase =
    params.supabaseClient ?? (await createServerSupabaseClient());
  const balance = await addPercoinsToBucket(
    supabase,
    params.userId,
    params.percoinPackage.credits,
    "promo"
  );

  await insertTransaction(supabase, {
    userId: params.userId,
    amount: params.percoinPackage.credits,
    transactionType: "purchase",
    metadata: {
      mode: "mock",
      packageId: params.percoinPackage.id,
      priceYen: params.percoinPackage.priceYen,
      bucket: "promo",
    },
  });

  return { balance };
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
  const result = await deductPercoinsFromWallet(
    supabase,
    params.userId,
    params.percoinAmount
  );

  await insertTransaction(supabase, {
    userId: params.userId,
    amount: -params.percoinAmount,
    transactionType: params.transactionType ?? "consumption",
    relatedGenerationId: params.relatedGenerationId ?? null,
    metadata: {
      ...(params.metadata ?? {}),
      from_promo: result.fromPromo,
      from_paid: result.fromPaid,
    },
  });

  return { balance: result.balance };
}
