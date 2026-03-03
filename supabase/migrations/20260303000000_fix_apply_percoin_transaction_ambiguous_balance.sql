-- apply_percoin_transaction: RETURNS TABLE(balance, ...) の balance が
-- UPDATE user_credits SET balance = balance + ... の右辺と衝突して
-- "column reference balance is ambiguous" エラーが発生するため、
-- user_credits を明示して修飾する

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
    IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
      RAISE EXCEPTION 'Unauthorized: caller must be service role or target user (auth.uid() = p_user_id)';
    END IF;
    RETURN QUERY SELECT * FROM deduct_free_percoins(p_user_id, p_amount, p_metadata, p_related_generation_id);
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Unauthorized: purchase modes can only be called with service role';
  END IF;

  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  IF p_mode = 'purchase_paid' THEN
    UPDATE user_credits
    SET paid_balance = user_credits.paid_balance + p_amount,
        balance = user_credits.balance + p_amount,
        updated_at = now()
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

    UPDATE user_credits
    SET balance = user_credits.balance + p_amount, updated_at = now()
    WHERE user_id = p_user_id;

    RETURN QUERY
    SELECT uc.balance, p_amount, 0
    FROM user_credits uc WHERE uc.user_id = p_user_id;
    RETURN;
  END IF;
END;
$$;
