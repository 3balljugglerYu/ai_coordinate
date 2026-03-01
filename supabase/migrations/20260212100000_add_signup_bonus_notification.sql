-- ===============================================
-- Add signup bonus notification on new user registration
-- ===============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_default_nickname text;
  v_signup_bonus integer := 50;
BEGIN
  IF NEW.email IS NOT NULL THEN
    v_default_nickname := split_part(NEW.email, '@', 1);
    IF length(v_default_nickname) > 20 THEN
      v_default_nickname := left(v_default_nickname, 20);
    END IF;
  END IF;

  INSERT INTO public.profiles (id, user_id, nickname)
  VALUES (NEW.id, NEW.id, v_default_nickname)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_credits (user_id, balance, paid_balance, promo_balance)
  VALUES (NEW.id, v_signup_bonus, 0, v_signup_bonus)
  ON CONFLICT (user_id) DO UPDATE
  SET
    promo_balance = public.user_credits.promo_balance + v_signup_bonus,
    balance = public.user_credits.paid_balance + public.user_credits.promo_balance + v_signup_bonus,
    updated_at = NOW();

  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    NEW.id,
    v_signup_bonus,
    'signup_bonus',
    jsonb_build_object('bucket', 'promo')
  );

  -- Signup bonus should be unified with other bonus notifications.
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
$function$;
