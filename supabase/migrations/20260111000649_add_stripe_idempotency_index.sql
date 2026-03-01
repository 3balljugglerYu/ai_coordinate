-- ===============================================
-- Stripe Idempotency Index Migration
-- stripe_payment_intent_idに対する部分UNIQUEインデックスを追加（べき等性保証）
-- ===============================================

-- べき等性保証用インデックス
-- stripe_payment_intent_idがNULLでない場合のみUNIQUE制約を適用
-- Webhookの重複送信時に同じ決済を複数回処理することを防止
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_stripe_payment_intent_id 
ON public.credit_transactions(stripe_payment_intent_id) 
WHERE stripe_payment_intent_id IS NOT NULL;

-- インデックスが正しく作成されたことを確認するためのコメント
COMMENT ON INDEX idx_credit_transactions_stripe_payment_intent_id IS 
'Stripe Payment Intent IDのべき等性保証用インデックス。NULL値は複数許可、非NULL値はUNIQUE。';
