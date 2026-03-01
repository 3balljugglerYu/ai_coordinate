-- Account deactivation / deletion lifecycle and forfeiture ledger

-- 1) Profile lifecycle columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deactivation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_deletion_scheduled_at
  ON public.profiles (deletion_scheduled_at)
  WHERE deactivated_at IS NOT NULL;

-- 2) Split wallet balances (paid/promo) while keeping backward compatible total balance
ALTER TABLE public.user_credits
  ADD COLUMN IF NOT EXISTS paid_balance integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_balance integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_credits_paid_balance_check'
      AND conrelid = 'public.user_credits'::regclass
  ) THEN
    ALTER TABLE public.user_credits
      ADD CONSTRAINT user_credits_paid_balance_check CHECK (paid_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_credits_promo_balance_check'
      AND conrelid = 'public.user_credits'::regclass
  ) THEN
    ALTER TABLE public.user_credits
      ADD CONSTRAINT user_credits_promo_balance_check CHECK (promo_balance >= 0);
  END IF;
END
$$;

-- Existing single-balance values are migrated to promo balance (chosen policy)
UPDATE public.user_credits
SET
  paid_balance = 0,
  promo_balance = COALESCE(balance, 0),
  balance = COALESCE(balance, 0)
WHERE paid_balance = 0
  AND promo_balance = 0;

-- 3) Extend transaction type for forfeiture event
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_transaction_type_check
  CHECK (
    transaction_type = ANY (
      ARRAY[
        'purchase'::text,
        'consumption'::text,
        'refund'::text,
        'signup_bonus'::text,
        'daily_post'::text,
        'streak'::text,
        'referral'::text,
        'admin_bonus'::text,
        'forfeiture'::text
      ]
    )
  );

-- 4) Forfeiture ledger (kept after auth user deletion)
CREATE TABLE IF NOT EXISTS public.credit_forfeiture_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_hash text NOT NULL,
  forfeited_paid integer NOT NULL CHECK (forfeited_paid >= 0),
  forfeited_promo integer NOT NULL CHECK (forfeited_promo >= 0),
  forfeited_total integer GENERATED ALWAYS AS (forfeited_paid + forfeited_promo) STORED,
  deletion_requested_at timestamptz NOT NULL,
  deleted_at timestamptz NOT NULL,
  retention_until timestamptz NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_credit_forfeiture_ledger_deleted_at
  ON public.credit_forfeiture_ledger (deleted_at);

CREATE INDEX IF NOT EXISTS idx_credit_forfeiture_ledger_retention_until
  ON public.credit_forfeiture_ledger (retention_until);

-- 5) Deactivation RPC
CREATE OR REPLACE FUNCTION public.request_account_deletion(
  p_user_id uuid,
  p_confirm_text text,
  p_reauth_ok boolean
)
RETURNS TABLE(status text, scheduled_for timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_existing_scheduled_at timestamptz;
BEGIN
  IF p_confirm_text IS DISTINCT FROM 'DELETE' THEN
    RAISE EXCEPTION 'Invalid confirmation text';
  END IF;

  IF COALESCE(p_reauth_ok, false) = false THEN
    RAISE EXCEPTION 'Re-authentication required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.profiles (id, user_id)
  VALUES (p_user_id, p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT deletion_scheduled_at
  INTO v_existing_scheduled_at
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_existing_scheduled_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_scheduled'::text, v_existing_scheduled_at;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    bio = NULL,
    avatar_url = NULL,
    deactivation_requested_at = v_now,
    deletion_scheduled_at = v_now + interval '30 days',
    deactivated_at = v_now
  WHERE user_id = p_user_id;

  UPDATE public.generated_images
  SET is_posted = false
  WHERE user_id = p_user_id
    AND is_posted = true;

  RETURN QUERY SELECT 'scheduled'::text, v_now + interval '30 days';
END;
$function$;

-- 6) Reactivation RPC
CREATE OR REPLACE FUNCTION public.cancel_account_deletion(p_user_id uuid)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_was_scheduled boolean;
BEGIN
  SELECT (deletion_scheduled_at IS NOT NULL)
  INTO v_was_scheduled
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF COALESCE(v_was_scheduled, false) = false THEN
    RETURN QUERY SELECT 'not_scheduled'::text;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    deactivation_requested_at = NULL,
    deletion_scheduled_at = NULL,
    deactivated_at = NULL,
    reactivated_at = now()
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT 'reactivated'::text;
END;
$function$;

-- 7) Due candidates RPC for purge worker
CREATE OR REPLACE FUNCTION public.get_due_deletion_candidates(p_limit integer DEFAULT 100)
RETURNS TABLE(user_id uuid, email text, deletion_scheduled_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
  SELECT
    p.user_id,
    u.email,
    p.deletion_scheduled_at
  FROM public.profiles p
  JOIN auth.users u
    ON u.id = p.user_id
  WHERE p.deactivated_at IS NOT NULL
    AND p.deletion_scheduled_at IS NOT NULL
    AND p.deletion_scheduled_at <= now()
  ORDER BY p.deletion_scheduled_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$function$;

-- 8) Forfeiture ledger upsert RPC (called right before auth user deletion)
CREATE OR REPLACE FUNCTION public.record_forfeiture_ledger(
  p_user_id uuid,
  p_email_hash text,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_paid integer := 0;
  v_promo integer := 0;
  v_requested_at timestamptz := now();
BEGIN
  SELECT
    COALESCE(uc.paid_balance, 0),
    COALESCE(uc.promo_balance, 0)
  INTO v_paid, v_promo
  FROM public.user_credits uc
  WHERE uc.user_id = p_user_id;

  SELECT COALESCE(pr.deactivation_requested_at, now())
  INTO v_requested_at
  FROM public.profiles pr
  WHERE pr.user_id = p_user_id;

  INSERT INTO public.credit_forfeiture_ledger (
    user_id,
    email_hash,
    forfeited_paid,
    forfeited_promo,
    deletion_requested_at,
    deleted_at,
    retention_until,
    metadata
  ) VALUES (
    p_user_id,
    p_email_hash,
    GREATEST(v_paid, 0),
    GREATEST(v_promo, 0),
    v_requested_at,
    p_deleted_at,
    p_deleted_at + interval '7 years',
    jsonb_build_object(
      'reason', 'account_deletion',
      'captured_at', now()
    )
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$function$;

-- 9) Existing trigger/function updates for split wallet
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

CREATE OR REPLACE FUNCTION public.grant_referral_bonus(
  p_referrer_id uuid,
  p_referred_id uuid,
  p_referral_code text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_referrer_code text;
  v_inserted_id uuid;
  v_bonus_amount integer := 100;
  v_notification_id uuid;
BEGIN
  IF p_referrer_id = p_referred_id THEN
    RAISE WARNING 'Self-referral is not allowed: user_id = %', p_referrer_id;
    RETURN 0;
  END IF;

  SELECT referral_code
  INTO v_referrer_code
  FROM profiles
  WHERE user_id = p_referrer_id;

  IF v_referrer_code IS NULL OR v_referrer_code != p_referral_code THEN
    RAISE WARNING 'Invalid referral code: expected %, got %', v_referrer_code, p_referral_code;
    RETURN 0;
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, referral_code)
  VALUES (p_referrer_id, p_referred_id, p_referral_code)
  ON CONFLICT (referred_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    INSERT INTO public.user_credits (user_id, balance, paid_balance, promo_balance)
    VALUES (p_referrer_id, v_bonus_amount, 0, v_bonus_amount)
    ON CONFLICT (user_id) DO UPDATE
    SET
      promo_balance = user_credits.promo_balance + v_bonus_amount,
      balance = user_credits.paid_balance + user_credits.promo_balance + v_bonus_amount,
      updated_at = NOW();

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (
      p_referrer_id,
      v_bonus_amount,
      'referral',
      jsonb_build_object(
        'referred_id', p_referred_id,
        'referral_code', p_referral_code,
        'granted_at', NOW(),
        'bucket', 'promo'
      )
    );

    INSERT INTO notifications (
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
      p_referrer_id,
      p_referrer_id,
      'bonus',
      'user',
      p_referrer_id,
      '紹介特典獲得！',
      '友達を紹介して100ペルコインを獲得しました！',
      jsonb_build_object(
        'bonus_amount', v_bonus_amount,
        'bonus_type', 'referral',
        'referred_id', p_referred_id,
        'referral_code', p_referral_code,
        'granted_at', NOW()
      ),
      false,
      NOW()
    ) RETURNING id INTO v_notification_id;

    RETURN v_bonus_amount;
  ELSE
    RETURN 0;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_admin_bonus(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_admin_id uuid,
  p_send_notification boolean DEFAULT true
)
RETURNS TABLE(amount_granted integer, transaction_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_notification_id uuid;
  v_transaction_id uuid;
BEGIN
  IF p_amount < 1 THEN
    RAISE EXCEPTION 'Invalid amount: amount must be at least 1';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Invalid reason: reason must be between 1 and 500 characters';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: user_id = %', p_user_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_admin_id) THEN
    RAISE EXCEPTION 'Admin user not found: admin_id = %', p_admin_id;
  END IF;

  INSERT INTO user_credits (user_id, balance, paid_balance, promo_balance)
  VALUES (p_user_id, p_amount, 0, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET
    promo_balance = user_credits.promo_balance + p_amount,
    balance = user_credits.paid_balance + user_credits.promo_balance + p_amount,
    updated_at = NOW();

  INSERT INTO credit_transactions (
    user_id,
    amount,
    transaction_type,
    metadata
  ) VALUES (
    p_user_id,
    p_amount,
    'admin_bonus',
    jsonb_build_object(
      'reason', trim(p_reason),
      'admin_id', p_admin_id,
      'granted_at', NOW(),
      'bucket', 'promo'
    )
  )
  RETURNING id INTO v_transaction_id;

  IF p_send_notification THEN
    INSERT INTO notifications (
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
      p_user_id,
      p_admin_id,
      'bonus',
      'user',
      p_user_id,
      '運営者からのボーナス！',
      p_amount || 'ペルコインが付与されました。' || trim(p_reason),
      jsonb_build_object(
        'bonus_amount', p_amount,
        'bonus_type', 'admin_bonus',
        'reason', trim(p_reason),
        'admin_id', p_admin_id,
        'granted_at', NOW()
      ),
      false,
      NOW()
    )
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN QUERY SELECT p_amount, v_transaction_id;
END;
$function$;
