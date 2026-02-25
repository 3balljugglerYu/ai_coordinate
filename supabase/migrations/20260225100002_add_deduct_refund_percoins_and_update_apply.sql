-- deduct_free_percoins, refund_percoins 作成
-- apply_percoin_transaction の consumption を deduct_free_percoins に委譲、purchase_promo を free_percoin_batches に変更
-- 前提: promo_balance は 20260225100000 で削除済み

-- 1. deduct_free_percoins
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

  UPDATE user_credits
  SET paid_balance = paid_balance - v_from_paid,
      balance = balance - p_amount,
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

-- 2. refund_percoins
CREATE OR REPLACE FUNCTION public.refund_percoins(
  p_user_id UUID,
  p_amount INTEGER,
  p_to_promo INTEGER,
  p_to_paid INTEGER,
  p_job_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expire_at TIMESTAMPTZ;
BEGIN
  IF p_amount <= 0 OR p_to_promo + p_to_paid != p_amount THEN
    RAISE EXCEPTION 'invalid refund amounts';
  END IF;

  IF p_job_id IS NOT NULL AND p_job_id != '' THEN
    IF EXISTS (
      SELECT 1 FROM credit_transactions
      WHERE user_id = p_user_id AND transaction_type = 'refund' AND metadata->>'job_id' = p_job_id
    ) THEN
      RETURN;
    END IF;
  END IF;

  IF p_to_promo > 0 THEN
    v_expire_at := (
      date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
      + interval '7 months' - interval '1 second'
    ) AT TIME ZONE 'Asia/Tokyo';

    INSERT INTO free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source)
    VALUES (p_user_id, p_to_promo, p_to_promo, now(), v_expire_at, 'refund');
  END IF;

  UPDATE user_credits
  SET paid_balance = paid_balance + p_to_paid,
      balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    p_user_id, p_amount, 'refund',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('to_promo', p_to_promo, 'to_paid', p_to_paid, 'job_id', p_job_id)
  );
END;
$$;

-- 3. apply_percoin_transaction を更新（consumption は deduct_free_percoins に委譲、purchase_promo は free_percoin_batches に）
CREATE OR REPLACE FUNCTION public.apply_percoin_transaction(
  p_user_id uuid,
  p_amount integer,
  p_mode text,
  p_metadata jsonb DEFAULT NULL,
  p_stripe_payment_intent_id text DEFAULT NULL,
  p_related_generation_id uuid DEFAULT NULL
)
RETURNS TABLE(balance integer, from_promo integer, from_paid integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expire_at TIMESTAMPTZ;
  v_tx_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_mode NOT IN ('purchase_paid', 'purchase_promo', 'consumption') THEN
    RAISE EXCEPTION 'unsupported mode: %', p_mode;
  END IF;

  IF p_mode = 'consumption' THEN
    RETURN QUERY SELECT * FROM deduct_free_percoins(p_user_id, p_amount, p_metadata, p_related_generation_id);
    RETURN;
  END IF;

  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  IF p_mode = 'purchase_paid' THEN
    UPDATE user_credits
    SET paid_balance = paid_balance + p_amount, balance = balance + p_amount, updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO credit_transactions (user_id, amount, transaction_type, stripe_payment_intent_id, metadata)
    VALUES (p_user_id, p_amount, 'purchase', p_stripe_payment_intent_id, COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('bucket', 'paid'))
    RETURNING id INTO v_tx_id;

    RETURN QUERY
    SELECT uc.balance, 0, p_amount
    FROM user_credits uc WHERE uc.user_id = p_user_id;
    RETURN;
  END IF;

  IF p_mode = 'purchase_promo' THEN
    v_expire_at := (
      date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
      + interval '7 months' - interval '1 second'
    ) AT TIME ZONE 'Asia/Tokyo';

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (p_user_id, p_amount, 'purchase', COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('bucket', 'promo'))
    RETURNING id INTO v_tx_id;

    INSERT INTO free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
    VALUES (p_user_id, p_amount, p_amount, now(), v_expire_at, 'admin_bonus', v_tx_id);

    UPDATE user_credits SET balance = balance + p_amount, updated_at = now() WHERE user_id = p_user_id;

    RETURN QUERY
    SELECT uc.balance, p_amount, 0
    FROM user_credits uc WHERE uc.user_id = p_user_id;
    RETURN;
  END IF;
END;
$$;
