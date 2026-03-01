-- Supabase Postgres Best Practices 準拠: バックフィル・JOIN のパフォーマンス改善
-- query-missing-indexes: WHERE/JOIN カラムへのインデックス
-- schema-foreign-key-indexes: FK は 20260228000005 で idx_fpb_credit_transaction_id 済み

-- 1. credit_transactions: バックフィル・取引履歴の (user_id, transaction_type, created_at) 検索を高速化
-- 既存の partial index は transaction_type 別のため、汎用検索用に追加
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_type_created
  ON public.credit_transactions (user_id, transaction_type, created_at)
  WHERE transaction_type IN ('signup_bonus', 'tour_bonus', 'referral', 'daily_post', 'streak', 'admin_bonus', 'refund');

-- 2. free_percoin_batches: credit_transaction_id IS NULL の検索（バックフィル・未紐付け確認）を高速化
-- バックフィル後は行数が少ないため partial index で十分
CREATE INDEX IF NOT EXISTS idx_fpb_null_credit_transaction
  ON public.free_percoin_batches (user_id, source)
  WHERE credit_transaction_id IS NULL;
