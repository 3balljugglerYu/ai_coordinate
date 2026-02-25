-- deduct_free_percoins: RETURNS TABLE(balance, ...) の balance が
-- UPDATE user_credits SET balance = balance - p_amount の右辺と衝突して
-- "column reference balance is ambiguous" エラーが発生するため、
-- テーブル名を明示して修飾する

CREATE OR REPLACE FUNCTION public.deduct_free_percoins(
  p_user_id UUID,
  p_amount INTEGER,
  p_metadata JSONB DEFAULT NULL,
  p_related_generation_id UUID DEFAULT NULL
)
RETURNS TABLE(balance INTEGER, from_promo INTEGER, from_paid INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_promo INTEGER := 0;
  v_from_paid INTEGER := 0;
  v_remaining INTEGER;
  v_deduct INTEGER;
  v_paid_balance INTEGER;
  v_new_balance INTEGER;
  v_job_id TEXT;
  r RECORD;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  v_job_id := p_metadata->>'job_id';
  IF v_job_id IS NOT NULL AND v_job_id != '' THEN
    SELECT COALESCE((ct.metadata->>'from_promo')::INTEGER, 0), COALESCE((ct.metadata->>'from_paid')::INTEGER, 0), uc.balance
    INTO v_from_promo, v_from_paid, v_new_balance
    FROM credit_transactions ct
    JOIN user_credits uc ON uc.user_id = ct.user_id
    WHERE ct.user_id = p_user_id
      AND ct.transaction_type = 'consumption'
      AND ct.metadata->>'job_id' = v_job_id;
    IF FOUND THEN
      RETURN QUERY SELECT v_new_balance, v_from_promo, v_from_paid;
      RETURN;
    END IF;
  END IF;

  v_remaining := p_amount;

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

  FOR r IN (
    SELECT id, remaining_amount
    FROM free_percoin_batches
    WHERE user_id = p_user_id AND remaining_amount > 0 AND expire_at > now()
    ORDER BY expire_at ASC
    FOR UPDATE
  ) LOOP
    EXIT WHEN v_remaining <= 0;
    v_deduct := LEAST(r.remaining_amount, v_remaining);
    v_from_promo := v_from_promo + v_deduct;
    v_remaining := v_remaining - v_deduct;

    UPDATE free_percoin_batches
    SET remaining_amount = remaining_amount - v_deduct, updated_at = now()
    WHERE id = r.id;

    DELETE FROM free_percoin_batches WHERE id = r.id AND remaining_amount = 0;
  END LOOP;

  v_from_paid := v_remaining;
  IF v_from_paid > v_paid_balance THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  -- user_credits を明示して RETURNS TABLE(balance) との衝突を回避
  UPDATE user_credits
  SET paid_balance = user_credits.paid_balance - v_from_paid,
      balance = user_credits.balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (user_id, amount, transaction_type, related_generation_id, metadata)
  VALUES (
    p_user_id, -p_amount, 'consumption', p_related_generation_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('from_promo', v_from_promo, 'from_paid', v_from_paid)
  );

  SELECT uc.balance INTO v_new_balance FROM user_credits uc WHERE uc.user_id = p_user_id;

  RETURN QUERY SELECT v_new_balance, v_from_promo, v_from_paid;
END;
$$;
