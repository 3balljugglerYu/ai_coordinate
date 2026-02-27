-- deduct_percoins_admin: RETURNS TABLE(balance, ...) の balance が
-- UPDATE user_credits SET balance = balance - ... の右辺と衝突して
-- "column reference balance is ambiguous" エラーが発生するため、
-- user_credits を明示して修正

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
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Unauthorized: deduct_percoins_admin can only be called with service role';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE transaction_type = 'admin_deduction'
      AND metadata->>'idempotency_key' = p_idempotency_key
  ) THEN
    SELECT uc.balance INTO v_new_balance FROM user_credits uc WHERE uc.user_id = p_user_id;
    RETURN QUERY SELECT COALESCE(v_new_balance, 0), 0;
    RETURN;
  END IF;

  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT uc.paid_balance INTO v_paid_balance
  FROM user_credits uc
  WHERE uc.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_credits row not found for user_id=%', p_user_id;
  END IF;

  v_actual_deduct := LEAST(p_amount, v_paid_balance);

  IF v_actual_deduct > 0 THEN
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
