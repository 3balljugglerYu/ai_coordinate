import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const PROMO_TYPES = [
  "signup_bonus",
  "daily_post",
  "streak",
  "referral",
  "admin_bonus",
  "tour_bonus",
];

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const supabase = createAdminClient();

  const { data: credits, error: creditsError } = await supabase
    .from("user_credits")
    .select("user_id, balance, paid_balance, promo_balance");

  if (creditsError) {
    console.error("Credits fetch error:", creditsError);
    return NextResponse.json(
      { error: "残高の取得に失敗しました" },
      { status: 500 }
    );
  }

  const userIds = (credits || []).map((c) => c.user_id).filter(Boolean);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, nickname")
    .in("user_id", userIds);

  const profileMap = (profiles || []).reduce(
    (acc, p) => {
      acc[p.user_id] = p.nickname ?? null;
      return acc;
    },
    {} as Record<string, string | null>
  );

  const { data: transactions } = await supabase
    .from("credit_transactions")
    .select("user_id, amount, transaction_type, metadata");

  const statsMap: Record<
    string,
    {
      promo_granted: number;
      paid_purchased: number;
      promo_consumed: number;
      paid_consumed: number;
      consumption_unknown: number;
    }
  > = {};

  for (const c of credits || []) {
    statsMap[c.user_id] = {
      promo_granted: 0,
      paid_purchased: 0,
      promo_consumed: 0,
      paid_consumed: 0,
      consumption_unknown: 0,
    };
  }

  for (const tx of transactions || []) {
    const uid = tx.user_id;
    if (!uid || !statsMap[uid]) continue;

    const amount = Number(tx.amount) || 0;

    if (tx.transaction_type === "purchase" && amount > 0) {
      statsMap[uid].paid_purchased += amount;
    } else if (PROMO_TYPES.includes(tx.transaction_type) && amount > 0) {
      statsMap[uid].promo_granted += amount;
    } else if (tx.transaction_type === "refund" && amount > 0) {
      statsMap[uid].promo_granted += amount;
    } else if (tx.transaction_type === "consumption" && amount < 0) {
      const absAmount = Math.abs(amount);
      const fromPaid = Number((tx.metadata as Record<string, unknown>)?.from_paid) || 0;
      const fromPromo = Number((tx.metadata as Record<string, unknown>)?.from_promo) || 0;
      statsMap[uid].paid_consumed += fromPaid;
      statsMap[uid].promo_consumed += fromPromo;
      const known = fromPaid + fromPromo;
      if (known < absAmount) {
        statsMap[uid].consumption_unknown += absAmount - known;
      }
    }
  }

  const items = (credits || []).map((c) => ({
    userId: c.user_id,
    nickname: profileMap[c.user_id] ?? null,
    balance: c.balance ?? 0,
    paid_balance: c.paid_balance ?? 0,
    promo_balance: c.promo_balance ?? 0,
    promo_granted: statsMap[c.user_id]?.promo_granted ?? 0,
    paid_purchased: statsMap[c.user_id]?.paid_purchased ?? 0,
    promo_consumed: statsMap[c.user_id]?.promo_consumed ?? 0,
    paid_consumed: statsMap[c.user_id]?.paid_consumed ?? 0,
    consumption_unknown: statsMap[c.user_id]?.consumption_unknown ?? 0,
  }));

  const sorted = items.sort(
    (a, b) => (b.paid_purchased + b.promo_granted) - (a.paid_purchased + a.promo_granted)
  );

  const totals = {
    balance: sorted.reduce((s, i) => s + i.balance, 0),
    paid_balance: sorted.reduce((s, i) => s + i.paid_balance, 0),
    promo_balance: sorted.reduce((s, i) => s + i.promo_balance, 0),
    promo_granted: sorted.reduce((s, i) => s + i.promo_granted, 0),
    paid_purchased: sorted.reduce((s, i) => s + i.paid_purchased, 0),
    promo_consumed: sorted.reduce((s, i) => s + i.promo_consumed, 0),
    paid_consumed: sorted.reduce((s, i) => s + i.paid_consumed, 0),
    consumption_unknown: sorted.reduce((s, i) => s + i.consumption_unknown, 0),
  };

  return NextResponse.json({
    items: sorted,
    totals,
  });
}
