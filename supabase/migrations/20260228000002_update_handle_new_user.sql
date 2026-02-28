-- handle_new_user: percoin_bonus_defaults 参照 + free_percoin_batches への INSERT に統一
-- promo_balance は 20260225100000 で削除済みのため、free_percoin_batches を使用

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_default_nickname text;
  v_signup_bonus integer;
  v_tx_id uuid;
  v_expire_at timestamptz;
BEGIN
  v_signup_bonus := get_percoin_bonus_default('signup_bonus');

  IF NEW.email IS NOT NULL THEN
    v_default_nickname := split_part(NEW.email, '@', 1);
    IF length(v_default_nickname) > 20 THEN
      v_default_nickname := left(v_default_nickname, 20);
    END IF;
  END IF;

  INSERT INTO public.profiles (id, user_id, nickname)
  VALUES (NEW.id, NEW.id, v_default_nickname)
  ON CONFLICT (user_id) DO NOTHING;

  v_expire_at := (
    date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo';

  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    NEW.id,
    v_signup_bonus,
    'signup_bonus',
    jsonb_build_object('bucket', 'promo')
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
  VALUES (NEW.id, v_signup_bonus, v_signup_bonus, now(), v_expire_at, 'signup_bonus', v_tx_id);

  INSERT INTO public.user_credits (user_id, balance, paid_balance)
  VALUES (NEW.id, v_signup_bonus, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + v_signup_bonus, updated_at = NOW();

  BEGIN
    INSERT INTO public.notifications (
      recipient_id,
      actor_id,
      type,
      entity_type,
      entity_id,
      title,
      body,
      data,
      is_read,
      created_at
    ) VALUES (
      NEW.id,
      NEW.id,
      'bonus',
      'user',
      NEW.id,
      '新規登録ボーナス獲得！',
      '新規登録特典として' || v_signup_bonus || 'ペルコインを獲得しました！',
      jsonb_build_object(
        'bonus_amount', v_signup_bonus,
        'bonus_type', 'signup_bonus',
        'granted_at', NOW()
      ),
      false,
      NOW()
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Error creating signup bonus notification: %', SQLERRM;
  END;

  BEGIN
    PERFORM generate_referral_code(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Error generating referral code: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
  RETURN NEW;
END;
$$;
