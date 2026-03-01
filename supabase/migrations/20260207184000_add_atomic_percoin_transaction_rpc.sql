-- ===============================================
-- Atomic percoin transaction RPC
-- Read/compute/write race を防ぐため、残高更新と取引記録を単一関数で実行する
-- ===============================================

CREATE OR REPLACE FUNCTION public.apply_percoin_transaction(
  p_user_id UUID,
  p_amount INTEGER,
  p_mode TEXT,
  p_metadata JSONB DEFAULT NULL,
  p_stripe_payment_intent_id TEXT DEFAULT NULL,
  p_related_generation_id UUID DEFAULT NULL
)
RETURNS TABLE (
  balance INTEGER,
  from_promo INTEGER,
  from_paid INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid_balance INTEGER;
  v_promo_balance INTEGER;
  v_new_paid_balance INTEGER;
  v_new_promo_balance INTEGER;
  v_from_promo INTEGER := 0;
  v_from_paid INTEGER := 0;
  v_tx_amount INTEGER;
  v_tx_type TEXT;
  v_metadata JSONB;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_mode NOT IN ('purchase_paid', 'purchase_promo', 'consumption') THEN
    RAISE EXCEPTION 'unsupported mode: %', p_mode;
  END IF;

  INSERT INTO public.user_credits (user_id, balance, paid_balance, promo_balance)
  VALUES (p_user_id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT paid_balance, promo_balance
  INTO v_paid_balance, v_promo_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_credits row was not found for user_id=%', p_user_id;
  END IF;

  IF p_mode = 'purchase_paid' THEN
    v_new_paid_balance := v_paid_balance + p_amount;
    v_new_promo_balance := v_promo_balance;
    v_tx_amount := p_amount;
    v_tx_type := 'purchase';
    v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('bucket', 'paid');
  ELSIF p_mode = 'purchase_promo' THEN
    v_new_paid_balance := v_paid_balance;
    v_new_promo_balance := v_promo_balance + p_amount;
    v_tx_amount := p_amount;
    v_tx_type := 'purchase';
    v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('bucket', 'promo');
  ELSE
    v_from_promo := LEAST(v_promo_balance, p_amount);
    v_from_paid := p_amount - v_from_promo;

    IF v_from_paid > v_paid_balance THEN
      RAISE EXCEPTION 'insufficient balance';
    END IF;

    v_new_paid_balance := v_paid_balance - v_from_paid;
    v_new_promo_balance := v_promo_balance - v_from_promo;
    v_tx_amount := -p_amount;
    v_tx_type := 'consumption';
    v_metadata :=
      COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object('from_promo', v_from_promo, 'from_paid', v_from_paid);
  END IF;

  UPDATE public.user_credits
  SET paid_balance = v_new_paid_balance,
      promo_balance = v_new_promo_balance,
      balance = v_new_paid_balance + v_new_promo_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    stripe_payment_intent_id,
    related_generation_id,
    metadata
  ) VALUES (
    p_user_id,
    v_tx_amount,
    v_tx_type,
    CASE WHEN v_tx_type = 'purchase' THEN p_stripe_payment_intent_id ELSE NULL END,
    p_related_generation_id,
    NULLIF(v_metadata, '{}'::jsonb)
  );

  RETURN QUERY
  SELECT
    v_new_paid_balance + v_new_promo_balance,
    v_from_promo,
    v_from_paid;
END;
$$;
