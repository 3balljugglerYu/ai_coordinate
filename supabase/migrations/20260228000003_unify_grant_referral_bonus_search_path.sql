-- grant_referral_bonus の search_path を他 grant 関数と統一（public のみ）
-- extensions スキーマは参照していないため、一貫性のため public のみに変更

CREATE OR REPLACE FUNCTION public.grant_referral_bonus(p_referrer_id uuid, p_referred_id uuid, p_referral_code text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_code text;
  v_inserted_id uuid;
  v_bonus_amount integer;
  v_notification_id uuid;
  v_tx_id uuid;
  v_expire_at timestamptz;
BEGIN
  v_bonus_amount := get_percoin_bonus_default('referral');

  IF p_referrer_id = p_referred_id THEN
    RAISE WARNING 'Self-referral is not allowed: user_id = %', p_referrer_id;
    RETURN 0;
  END IF;

  SELECT referral_code INTO v_referrer_code FROM profiles WHERE user_id = p_referrer_id;

  IF v_referrer_code IS NULL OR v_referrer_code != p_referral_code THEN
    RAISE WARNING 'Invalid referral code: expected %, got %', v_referrer_code, p_referral_code;
    RETURN 0;
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, referral_code)
  VALUES (p_referrer_id, p_referred_id, p_referral_code)
  ON CONFLICT (referred_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    v_expire_at := (
      date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
      + interval '7 months' - interval '1 second'
    ) AT TIME ZONE 'Asia/Tokyo';

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (
      p_referrer_id, v_bonus_amount, 'referral',
      jsonb_build_object('referred_id', p_referred_id, 'referral_code', p_referral_code, 'granted_at', NOW(), 'bucket', 'promo')
    )
    RETURNING id INTO v_tx_id;

    INSERT INTO free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
    VALUES (p_referrer_id, v_bonus_amount, v_bonus_amount, now(), v_expire_at, 'referral', v_tx_id);

    INSERT INTO public.user_credits (user_id, balance, paid_balance)
    VALUES (p_referrer_id, v_bonus_amount, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = user_credits.balance + v_bonus_amount, updated_at = NOW();

    INSERT INTO notifications (
      recipient_id, actor_id, type, entity_type, entity_id, title, body, data, is_read, created_at
    ) VALUES (
      p_referrer_id, p_referrer_id, 'bonus', 'user', p_referrer_id,
      '紹介特典獲得！', '友達を紹介して' || v_bonus_amount || 'ペルコインを獲得しました！',
      jsonb_build_object('bonus_amount', v_bonus_amount, 'bonus_type', 'referral', 'referred_id', p_referred_id, 'referral_code', p_referral_code, 'granted_at', NOW()),
      false, NOW()
    ) RETURNING id INTO v_notification_id;

    RETURN v_bonus_amount;
  ELSE
    RETURN 0;
  END IF;
END;
$$;
