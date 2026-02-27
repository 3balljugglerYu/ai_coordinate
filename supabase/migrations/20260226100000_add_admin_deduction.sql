-- 管理画面からのペルコイン減算: transaction_type 追加、deduct_percoins_admin RPC、冪等インデックス
-- SQL Editor で手動実行する場合はこのファイルの内容をコピーして実行してください

-- 1. transaction_type に admin_deduction を追加
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'purchase', 'consumption', 'refund', 'signup_bonus', 'daily_post',
    'streak', 'referral', 'admin_bonus', 'forfeiture', 'tour_bonus', 'admin_deduction'
  ]));

-- 2. deduct_percoins_admin RPC
CREATE OR REPLACE FUNCTION public.deduct_percoins_admin(
  p_user_id UUID,
  p_amount INTEGER,
  p_idempotency_key TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE(balance INTEGER, amount_deducted INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid_balance INTEGER;
  v_actual_deduct INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- 認可: service_role のみ
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Unauthorized: deduct_percoins_admin can only be called with service role';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  -- 冪等チェック: 既に処理済みならスキップ
  IF EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE transaction_type = 'admin_deduction'
      AND metadata->>'idempotency_key' = p_idempotency_key
  ) THEN
    SELECT uc.balance INTO v_new_balance FROM user_credits uc WHERE uc.user_id = p_user_id;
    RETURN QUERY SELECT COALESCE(v_new_balance, 0), 0;
    RETURN;
  END IF;

  -- user_credits がなければ作成
  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- paid_balance を取得してロック
  SELECT uc.paid_balance INTO v_paid_balance
  FROM user_credits uc
  WHERE uc.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_credits row not found for user_id=%', p_user_id;
  END IF;

  -- 減算可能な分のみ減算（残高不足時は不足分は運営負担）
  v_actual_deduct := LEAST(p_amount, v_paid_balance);

  IF v_actual_deduct > 0 THEN
    -- user_credits を明示して RETURNS TABLE(balance) との衝突を回避
    UPDATE user_credits
    SET paid_balance = user_credits.paid_balance - v_actual_deduct,
        balance = user_credits.balance - v_actual_deduct,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (
      p_user_id,
      -v_actual_deduct,
      'admin_deduction',
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('idempotency_key', p_idempotency_key)
    );
  END IF;

  SELECT uc.balance INTO v_new_balance FROM user_credits uc WHERE uc.user_id = p_user_id;
  RETURN QUERY SELECT v_new_balance, v_actual_deduct;
END;
$$;

-- 3. 冪等チェック用部分インデックス（推奨）
CREATE INDEX IF NOT EXISTS idx_credit_transactions_admin_deduction_idempotency
  ON public.credit_transactions ((metadata->>'idempotency_key'))
  WHERE transaction_type = 'admin_deduction' AND metadata->>'idempotency_key' IS NOT NULL;
