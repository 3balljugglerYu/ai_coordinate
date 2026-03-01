-- 過去の取引（紐付けバッチがないもの）に期間限定ラベルを表示するため、
-- remaining_amount=0 の表示専用バッチを作成する。
-- 残高計算（get_percoin_balance_breakdown）は remaining_amount > 0 のみ対象のため影響なし。
--
-- Supabase Postgres Best Practices 準拠:
-- - data-batch-inserts: 単一 INSERT SELECT でバルク挿入（行ごとの INSERT 回避）
-- - 冪等性: NOT EXISTS で重複挿入を防止

INSERT INTO public.free_percoin_batches (
  user_id,
  amount,
  remaining_amount,
  granted_at,
  expire_at,
  source,
  credit_transaction_id
)
SELECT
  ct.user_id,
  GREATEST(
    CASE WHEN ct.transaction_type = 'refund'
      THEN COALESCE((ct.metadata->>'to_promo')::int, 1)
      ELSE ct.amount
    END,
    1
  ),
  0,
  ct.created_at,
  (
    date_trunc('month', ct.created_at AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo',
  ct.transaction_type::text,
  ct.id
FROM credit_transactions ct
WHERE ct.transaction_type IN ('signup_bonus', 'tour_bonus', 'referral', 'daily_post', 'streak', 'admin_bonus', 'refund')
  AND NOT EXISTS (
    SELECT 1 FROM free_percoin_batches fpb
    WHERE fpb.credit_transaction_id = ct.id
  )
  -- refund は to_promo > 0 のもののみ（to_promo=0 は paid のみ返金でバッチ不要）
  AND (
    ct.transaction_type != 'refund'
    OR COALESCE((ct.metadata->>'to_promo')::int, 0) > 0
  );
