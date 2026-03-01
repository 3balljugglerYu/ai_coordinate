-- ===============================================
-- Admin Bonus Transaction Type Migration
-- 運営者からのボーナス付与機能: transaction_typeに'admin_bonus'を追加
-- ===============================================

-- 既存のCHECK制約を削除
ALTER TABLE credit_transactions
DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

-- 'admin_bonus'を含む新しいCHECK制約を作成
ALTER TABLE credit_transactions
ADD CONSTRAINT credit_transactions_transaction_type_check
CHECK (transaction_type = ANY (ARRAY[
  'purchase'::text,
  'consumption'::text,
  'refund'::text,
  'signup_bonus'::text,
  'daily_post'::text,
  'streak'::text,
  'referral'::text,
  'admin_bonus'::text
]));
