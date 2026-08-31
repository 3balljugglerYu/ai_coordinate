import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "./fetch-all-rows";

/**
 * ペルコイン残高内訳の集計。
 *
 * `app/(app)/admin/credits-summary/page.tsx` と
 * `app/api/admin/credits-summary/route.ts` に同じ実装が2本あり、どちらも
 * `credit_transactions` を**期間フィルタ無しの全期間**で取得していた。
 * PostgREST の 1,000行上限に当たり、全 9,154行(2026-08-31時点)に対して
 * **約11%しか集計できていなかった**（付与額・購入額・消費額がすべて過小）。
 *
 * 同じ集計が2箇所にあると片方だけ直して差が出るので、ここに寄せた。
 * 打ち切りの詳細は fetch-all-rows.ts のコメントを参照。
 */

const PROMO_TYPES = [
  "signup_bonus",
  "daily_post",
  "streak",
  "referral",
  "admin_bonus",
  "tour_bonus",
];

export interface CreditsSummaryItem {
  userId: string;
  nickname: string | null;
  balance: number;
  paid_balance: number;
  promo_balance: number;
  promo_granted: number;
  paid_purchased: number;
  promo_consumed: number;
  paid_consumed: number;
  consumption_unknown: number;
}

export interface CreditsSummaryTotals {
  balance: number;
  paid_balance: number;
  promo_balance: number;
  promo_granted: number;
  paid_purchased: number;
  promo_consumed: number;
  paid_consumed: number;
  consumption_unknown: number;
}

type CreditRow = {
  id: string;
  user_id: string;
  balance: number | null;
  paid_balance: number | null;
};

type TransactionRow = {
  id: string;
  user_id: string | null;
  amount: number | null;
  transaction_type: string;
  metadata: Record<string, unknown> | null;
};

type Stats = {
  promo_granted: number;
  paid_purchased: number;
  promo_consumed: number;
  paid_consumed: number;
  consumption_unknown: number;
};

export async function getCreditsSummary(): Promise<{
  items: CreditsSummaryItem[];
  totals: CreditsSummaryTotals;
}> {
  const supabase = createAdminClient();

  const { data: credits, error: creditsError } =
    await fetchAllRows<CreditRow>((cursor, size) => {
      let query = supabase
        .from("user_credits")
        .select("id, user_id, balance, paid_balance");
      if (cursor) query = query.gt("id", cursor);
      return query.order("id", { ascending: true }).limit(size);
    });

  if (creditsError || !credits) {
    throw new Error("残高の取得に失敗しました");
  }

  const { data: transactions, error: transactionsError } =
    await fetchAllRows<TransactionRow>((cursor, size) => {
      let query = supabase
        .from("credit_transactions")
        .select("id, user_id, amount, transaction_type, metadata");
      if (cursor) query = query.gt("id", cursor);
      return query.order("id", { ascending: true }).limit(size);
    });

  /*
    元の実装は transactions の error を見ておらず、失敗しても付与額・購入額が
    すべて 0 の表として描画されていた。0 は「0だった」という嘘の数字として
    読めるので、静かに続行せず落とす（#579 と同じ方針）。
  */
  if (transactionsError || !transactions) {
    throw new Error("取引履歴の取得に失敗しました");
  }

  const userIds = credits.map((row) => row.user_id).filter(Boolean);

  // ニックネームは表示のみ。取れなくても数字は壊れないので失敗を許容する
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, nickname")
    .in("user_id", userIds);

  const profileMap = new Map<string, string | null>(
    (profiles ?? []).map((row) => [row.user_id as string, (row.nickname as string | null) ?? null])
  );

  const statsMap = new Map<string, Stats>(
    credits.map((row) => [
      row.user_id,
      {
        promo_granted: 0,
        paid_purchased: 0,
        promo_consumed: 0,
        paid_consumed: 0,
        consumption_unknown: 0,
      },
    ])
  );

  for (const tx of transactions) {
    const uid = tx.user_id;
    if (!uid) continue;

    const stats = statsMap.get(uid);
    if (!stats) continue;

    const amount = Number(tx.amount) || 0;

    if (tx.transaction_type === "purchase" && amount > 0) {
      stats.paid_purchased += amount;
    } else if (PROMO_TYPES.includes(tx.transaction_type) && amount > 0) {
      stats.promo_granted += amount;
    } else if (tx.transaction_type === "refund" && amount > 0) {
      stats.promo_granted += amount;
    } else if (tx.transaction_type === "consumption" && amount < 0) {
      const absAmount = Math.abs(amount);
      const fromPaid = Number(tx.metadata?.from_paid) || 0;
      const fromPromo = Number(tx.metadata?.from_promo) || 0;
      stats.paid_consumed += fromPaid;
      stats.promo_consumed += fromPromo;
      const known = fromPaid + fromPromo;
      if (known < absAmount) {
        stats.consumption_unknown += absAmount - known;
      }
    }
  }

  const items: CreditsSummaryItem[] = credits.map((row) => {
    const balance = row.balance ?? 0;
    const paidBalance = row.paid_balance ?? 0;
    const stats = statsMap.get(row.user_id);

    return {
      userId: row.user_id,
      nickname: profileMap.get(row.user_id) ?? null,
      balance,
      paid_balance: paidBalance,
      promo_balance: balance - paidBalance,
      promo_granted: stats?.promo_granted ?? 0,
      paid_purchased: stats?.paid_purchased ?? 0,
      promo_consumed: stats?.promo_consumed ?? 0,
      paid_consumed: stats?.paid_consumed ?? 0,
      consumption_unknown: stats?.consumption_unknown ?? 0,
    };
  });

  const sorted = items.sort(
    (a, b) =>
      b.paid_purchased + b.promo_granted - (a.paid_purchased + a.promo_granted)
  );

  const sum = (pick: (item: CreditsSummaryItem) => number) =>
    sorted.reduce((total, item) => total + pick(item), 0);

  return {
    items: sorted,
    totals: {
      balance: sum((i) => i.balance),
      paid_balance: sum((i) => i.paid_balance),
      promo_balance: sum((i) => i.promo_balance),
      promo_granted: sum((i) => i.promo_granted),
      paid_purchased: sum((i) => i.paid_purchased),
      promo_consumed: sum((i) => i.promo_consumed),
      paid_consumed: sum((i) => i.paid_consumed),
      consumption_unknown: sum((i) => i.consumption_unknown),
    },
  };
}
