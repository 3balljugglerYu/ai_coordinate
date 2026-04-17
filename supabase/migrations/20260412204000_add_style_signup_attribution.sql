-- Track /style-origin signups and signup CTA clicks for admin analytics.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS signup_source TEXT;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_signup_source_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_signup_source_check
CHECK (
  signup_source IS NULL
  OR signup_source = ANY (ARRAY['style'::text])
);

COMMENT ON COLUMN public.profiles.signup_source IS
  'Initial signup source attribution. Currently tracks style-origin registrations.';

ALTER TABLE public.style_usage_events
DROP CONSTRAINT IF EXISTS style_usage_events_event_type_check;

ALTER TABLE public.style_usage_events
ADD CONSTRAINT style_usage_events_event_type_check
CHECK (
  event_type = ANY (
    ARRAY[
      'visit'::text,
      'generate_attempt'::text,
      'generate'::text,
      'download'::text,
      'rate_limited'::text,
      'signup_click'::text
    ]
  )
);

COMMENT ON COLUMN public.style_usage_events.event_type IS
  'visit / generate_attempt / generate / download / rate_limited / signup_click';

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
  v_signup_source text;
BEGIN
  v_signup_bonus := get_percoin_bonus_default('signup_bonus');

  IF NEW.email IS NOT NULL THEN
    v_default_nickname := split_part(NEW.email, '@', 1);
    IF length(v_default_nickname) > 20 THEN
      v_default_nickname := left(v_default_nickname, 20);
    END IF;
  END IF;

  v_signup_source := NULLIF(NEW.raw_user_meta_data->>'signup_source', '');
  IF v_signup_source IS NOT NULL AND v_signup_source <> 'style' THEN
    v_signup_source := NULL;
  END IF;

  INSERT INTO public.profiles (id, user_id, nickname, signup_source)
  VALUES (NEW.id, NEW.id, v_default_nickname, v_signup_source)
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
