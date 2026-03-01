-- 取引履歴の汎用クエリ用インデックス
-- get_percoin_transactions_with_expiry の p_filter='all' / 'regular' (purchase) で使用
-- 既存の idx_credit_transactions_user_type_created は partial index のため purchase/consumption をカバーしない

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created
  ON public.credit_transactions (user_id, created_at DESC);
