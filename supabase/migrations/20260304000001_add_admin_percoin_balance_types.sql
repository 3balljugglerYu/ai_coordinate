-- admin 付与 / 減算で 無期限 / 期間限定 を選べるようにする
-- free_percoin_batches.expire_at を admin_bonus のみ nullable にし、
-- read RPC / grant_admin_bonus / deduct_percoins_admin を対応させる

ALTER TABLE public.free_percoin_batches
  ALTER COLUMN expire_at DROP NOT NULL;

ALTER TABLE public.free_percoin_batches
  DROP CONSTRAINT IF EXISTS free_percoin_batches_expire_required_non_admin_bonus;

ALTER TABLE public.free_percoin_batches
  ADD CONSTRAINT free_percoin_batches_expire_required_non_admin_bonus
  CHECK (source = 'admin_bonus' OR expire_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_fpb_user_remaining_unlimited
  ON public.free_percoin_batches (user_id)
  WHERE remaining_amount > 0 AND expire_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fpb_user_remaining_period_limited_expire
  ON public.free_percoin_batches (user_id, expire_at)
  WHERE remaining_amount > 0 AND expire_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.expire_free_percoin_batches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH expired AS (
    SELECT fpb.id, fpb.user_id, fpb.amount, fpb.remaining_amount, fpb.granted_at, fpb.expire_at, fpb.source
    FROM free_percoin_batches fpb
    WHERE fpb.expire_at IS NOT NULL
      AND fpb.expire_at < now()
      AND fpb.remaining_amount > 0
      AND NOT EXISTS (
        SELECT 1
        FROM free_percoin_expiration_log l
        WHERE l.batch_id = fpb.id
      )
    FOR UPDATE
  )
  INSERT INTO free_percoin_expiration_log (
    batch_id,
    user_id,
    amount_expired,
    original_amount,
    granted_at,
    expire_at,
    source,
    reason
  )
  SELECT id, user_id, remaining_amount, amount, granted_at, expire_at, source, 'monthly_expiration'
  FROM expired;

  UPDATE user_credits uc
  SET balance = balance - e.total_expired,
      updated_at = now()
  FROM (
    SELECT l.user_id, SUM(l.amount_expired) AS total_expired
    FROM free_percoin_expiration_log l
    WHERE l.batch_id IN (
      SELECT id
      FROM free_percoin_batches
      WHERE expire_at IS NOT NULL
        AND expire_at < now()
        AND remaining_amount > 0
    )
    GROUP BY l.user_id
  ) e
  WHERE uc.user_id = e.user_id;

  DELETE FROM free_percoin_batches fpb
  WHERE fpb.expire_at IS NOT NULL
    AND fpb.expire_at < now()
    AND fpb.remaining_amount > 0
    AND EXISTS (
      SELECT 1
      FROM free_percoin_expiration_log l
      WHERE l.batch_id = fpb.id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_free_percoin_batches_expiring(p_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, user_id uuid, remaining_amount integer, expire_at timestamp with time zone, source text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    RETURN;
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT fpb.id, fpb.user_id, fpb.remaining_amount, fpb.expire_at, fpb.source
  FROM free_percoin_batches fpb
  WHERE fpb.user_id = v_user_id
    AND fpb.remaining_amount > 0
    AND fpb.expire_at IS NOT NULL
    AND fpb.expire_at > now()
  ORDER BY fpb.expire_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_free_percoin_batches_expiring(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_free_percoin_batches_expiring(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_expiring_this_month_count(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(expiring_this_month BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    RETURN QUERY SELECT 0::BIGINT;
    RETURN;
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 0::BIGINT;
    RETURN;
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo';
  v_month_end := v_month_start + interval '1 month';

  RETURN QUERY
  SELECT COALESCE(SUM(fpb.remaining_amount), 0)::BIGINT
  FROM free_percoin_batches fpb
  WHERE fpb.user_id = v_user_id
    AND fpb.remaining_amount > 0
    AND fpb.expire_at IS NOT NULL
    AND fpb.expire_at >= v_month_start
    AND fpb.expire_at < v_month_end;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_expiring_this_month_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expiring_this_month_count(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.deduct_free_percoins(
  p_user_id uuid,
  p_amount integer,
  p_metadata jsonb DEFAULT NULL::jsonb,
  p_related_generation_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(balance integer, from_promo integer, from_paid integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller must be service role or target user (auth.uid() = p_user_id)';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  v_job_id := p_metadata->>'job_id';
  IF v_job_id IS NOT NULL AND v_job_id != '' THEN
    SELECT
      COALESCE((ct.metadata->>'from_promo')::INTEGER, 0),
      COALESCE((ct.metadata->>'from_paid')::INTEGER, 0),
      uc.balance
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
    WHERE user_id = p_user_id
      AND remaining_amount > 0
      AND (expire_at IS NULL OR expire_at > now())
    ORDER BY expire_at ASC NULLS LAST
    FOR UPDATE
  ) LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct := LEAST(r.remaining_amount, v_remaining);
    v_from_promo := v_from_promo + v_deduct;
    v_remaining := v_remaining - v_deduct;

    UPDATE free_percoin_batches
    SET remaining_amount = remaining_amount - v_deduct,
        updated_at = now()
    WHERE id = r.id;

    DELETE FROM free_percoin_batches
    WHERE id = r.id AND remaining_amount = 0;
  END LOOP;

  v_from_paid := v_remaining;
  IF v_from_paid > v_paid_balance THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  UPDATE user_credits
  SET paid_balance = user_credits.paid_balance - v_from_paid,
      balance = user_credits.balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (user_id, amount, transaction_type, related_generation_id, metadata)
  VALUES (
    p_user_id,
    -p_amount,
    'consumption',
    p_related_generation_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('from_promo', v_from_promo, 'from_paid', v_from_paid)
  );

  SELECT uc.balance INTO v_new_balance
  FROM user_credits uc
  WHERE uc.user_id = p_user_id;

  RETURN QUERY SELECT v_new_balance, v_from_promo, v_from_paid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_percoin_balance_breakdown(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(total INTEGER, regular INTEGER, period_limited BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    RETURN;
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(uc.balance, 0)::INTEGER AS total,
    (
      COALESCE(uc.paid_balance, 0)
      + COALESCE((
        SELECT SUM(fpb.remaining_amount)
        FROM free_percoin_batches fpb
        WHERE fpb.user_id = v_user_id
          AND fpb.remaining_amount > 0
          AND fpb.expire_at IS NULL
      ), 0)
    )::INTEGER AS regular,
    COALESCE((
      SELECT SUM(fpb.remaining_amount)
      FROM free_percoin_batches fpb
      WHERE fpb.user_id = v_user_id
        AND fpb.remaining_amount > 0
        AND fpb.expire_at IS NOT NULL
        AND fpb.expire_at > now()
    ), 0)::BIGINT AS period_limited
  FROM (SELECT v_user_id AS user_id) target
  LEFT JOIN user_credits uc ON uc.user_id = target.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_percoin_balance_breakdown(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_balance_breakdown(UUID) TO service_role;

DROP FUNCTION IF EXISTS public.grant_admin_bonus(UUID, INTEGER, TEXT, UUID, BOOLEAN);

CREATE FUNCTION public.grant_admin_bonus(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_admin_id uuid,
  p_send_notification boolean DEFAULT true,
  p_balance_type text DEFAULT 'period_limited'
)
RETURNS TABLE(amount_granted integer, transaction_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_notification_id uuid;
  v_transaction_id uuid;
  v_expire_at timestamptz;
  v_metadata jsonb;
  v_notification_data jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized: caller must be the admin (auth.uid() = p_admin_id) or use service role';
  END IF;

  IF p_amount < 1 THEN
    RAISE EXCEPTION 'Invalid amount: amount must be at least 1';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Invalid reason: reason must be between 1 and 500 characters';
  END IF;

  IF p_balance_type NOT IN ('period_limited', 'unlimited') THEN
    RAISE EXCEPTION 'Invalid balance_type: must be period_limited or unlimited';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: user_id = %', p_user_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_admin_id) THEN
    RAISE EXCEPTION 'Admin user not found: admin_id = %', p_admin_id;
  END IF;

  IF p_balance_type = 'period_limited' THEN
    v_expire_at := (
      date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
      + interval '7 months' - interval '1 second'
    ) AT TIME ZONE 'Asia/Tokyo';
  ELSE
    v_expire_at := NULL;
  END IF;

  v_metadata := jsonb_build_object(
    'reason', trim(p_reason),
    'admin_id', p_admin_id,
    'granted_at', now(),
    'balance_type', p_balance_type
  ) || CASE
    WHEN v_expire_at IS NOT NULL THEN jsonb_build_object('expire_at', v_expire_at)
    ELSE '{}'::jsonb
  END;

  INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (p_user_id, p_amount, 'admin_bonus', v_metadata)
  RETURNING id INTO v_transaction_id;

  INSERT INTO free_percoin_batches (
    user_id,
    amount,
    remaining_amount,
    granted_at,
    expire_at,
    source,
    credit_transaction_id
  )
  VALUES (
    p_user_id,
    p_amount,
    p_amount,
    now(),
    v_expire_at,
    'admin_bonus',
    v_transaction_id
  );

  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, p_amount, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + p_amount,
      updated_at = NOW();

  IF p_send_notification THEN
    v_notification_data := jsonb_build_object(
      'bonus_amount', p_amount,
      'bonus_type', 'admin_bonus',
      'reason', trim(p_reason),
      'admin_id', p_admin_id,
      'granted_at', NOW(),
      'balance_type', p_balance_type
    ) || CASE
      WHEN v_expire_at IS NOT NULL THEN jsonb_build_object('expire_at', v_expire_at)
      ELSE '{}'::jsonb
    END;

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
      v_notification_data,
      false,
      NOW()
    )
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN QUERY SELECT p_amount, v_transaction_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.grant_admin_bonus(UUID, INTEGER, TEXT, UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_admin_bonus(UUID, INTEGER, TEXT, UUID, BOOLEAN, TEXT) TO service_role;

DROP FUNCTION IF EXISTS public.deduct_percoins_admin(UUID, INTEGER, TEXT, JSONB);

CREATE FUNCTION public.deduct_percoins_admin(
  p_user_id uuid,
  p_amount integer,
  p_balance_type text,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT NULL::jsonb
)
RETURNS TABLE(balance integer, amount_deducted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_paid_balance INTEGER;
  v_remaining INTEGER;
  v_deduct INTEGER;
  v_from_unlimited_bonus INTEGER := 0;
  v_from_paid INTEGER := 0;
  v_new_balance INTEGER;
  r RECORD;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Unauthorized: deduct_percoins_admin can only be called with service role';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_balance_type NOT IN ('period_limited', 'unlimited') THEN
    RAISE EXCEPTION 'balance_type must be period_limited or unlimited';
  END IF;

  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM credit_transactions
    WHERE transaction_type = 'admin_deduction'
      AND metadata->>'idempotency_key' = p_idempotency_key
  ) THEN
    SELECT uc.balance INTO v_new_balance
    FROM user_credits uc
    WHERE uc.user_id = p_user_id;

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

  v_remaining := p_amount;

  IF p_balance_type = 'period_limited' THEN
    FOR r IN (
      SELECT id, remaining_amount
      FROM free_percoin_batches
      WHERE user_id = p_user_id
        AND remaining_amount > 0
        AND expire_at IS NOT NULL
        AND expire_at > now()
      ORDER BY expire_at ASC
      FOR UPDATE
    ) LOOP
      EXIT WHEN v_remaining <= 0;

      v_deduct := LEAST(r.remaining_amount, v_remaining);
      v_remaining := v_remaining - v_deduct;

      UPDATE free_percoin_batches
      SET remaining_amount = remaining_amount - v_deduct,
          updated_at = now()
      WHERE id = r.id;

      DELETE FROM free_percoin_batches
      WHERE id = r.id AND remaining_amount = 0;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'ユーザーが保有している期間限定のペルコインが、設定したペルコイン数より少ないです。';
    END IF;

    UPDATE user_credits
    SET balance = user_credits.balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (
      p_user_id,
      -p_amount,
      'admin_deduction',
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'balance_type', p_balance_type,
        'idempotency_key', p_idempotency_key,
        'from_period_limited', p_amount
      )
    );
  ELSE
    FOR r IN (
      SELECT id, remaining_amount
      FROM free_percoin_batches
      WHERE user_id = p_user_id
        AND remaining_amount > 0
        AND expire_at IS NULL
      ORDER BY granted_at ASC
      FOR UPDATE
    ) LOOP
      EXIT WHEN v_remaining <= 0;

      v_deduct := LEAST(r.remaining_amount, v_remaining);
      v_from_unlimited_bonus := v_from_unlimited_bonus + v_deduct;
      v_remaining := v_remaining - v_deduct;

      UPDATE free_percoin_batches
      SET remaining_amount = remaining_amount - v_deduct,
          updated_at = now()
      WHERE id = r.id;

      DELETE FROM free_percoin_batches
      WHERE id = r.id AND remaining_amount = 0;
    END LOOP;

    v_from_paid := v_remaining;
    IF v_from_paid > v_paid_balance THEN
      RAISE EXCEPTION 'ユーザーが保有している無期限のペルコインが、設定したペルコイン数より少ないです。';
    END IF;

    UPDATE user_credits
    SET paid_balance = user_credits.paid_balance - v_from_paid,
        balance = user_credits.balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (
      p_user_id,
      -p_amount,
      'admin_deduction',
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'balance_type', p_balance_type,
        'idempotency_key', p_idempotency_key,
        'from_unlimited_bonus', v_from_unlimited_bonus,
        'from_paid', v_from_paid
      )
    );
  END IF;

  SELECT uc.balance INTO v_new_balance
  FROM user_credits uc
  WHERE uc.user_id = p_user_id;

  RETURN QUERY SELECT v_new_balance, p_amount;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.deduct_percoins_admin(UUID, INTEGER, TEXT, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.get_percoin_transactions_with_expiry(
  p_user_id uuid DEFAULT NULL::uuid,
  p_filter text DEFAULT 'all'::text,
  p_sort text DEFAULT 'created_at'::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  amount integer,
  transaction_type text,
  metadata jsonb,
  created_at timestamp with time zone,
  expire_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    RETURN;
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ct.id, ct.amount, ct.transaction_type, ct.metadata, ct.created_at, fpb.expire_at
  FROM credit_transactions ct
  LEFT JOIN free_percoin_batches fpb
    ON fpb.credit_transaction_id = ct.id AND fpb.user_id = ct.user_id
  WHERE ct.user_id = v_user_id
    AND (
      p_filter = 'all'
      OR (
        p_filter = 'regular'
        AND (
          (ct.transaction_type = 'purchase' AND fpb.expire_at IS NULL)
          OR (ct.transaction_type = 'admin_bonus' AND fpb.expire_at IS NULL)
          OR (ct.transaction_type = 'admin_deduction' AND ct.metadata->>'balance_type' = 'unlimited')
        )
      )
      OR (
        p_filter = 'period_limited'
        AND (
          (fpb.expire_at IS NOT NULL AND ct.transaction_type != 'refund')
          OR (ct.transaction_type = 'admin_deduction' AND ct.metadata->>'balance_type' = 'period_limited')
        )
      )
      OR (p_filter = 'usage' AND ct.transaction_type IN ('consumption', 'refund'))
    )
  ORDER BY ct.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_with_expiry(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_with_expiry(UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.get_percoin_transactions_count(
  p_user_id uuid DEFAULT NULL::uuid,
  p_filter text DEFAULT 'all'::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    RETURN 0;
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM credit_transactions ct
  LEFT JOIN free_percoin_batches fpb
    ON fpb.credit_transaction_id = ct.id AND fpb.user_id = ct.user_id
  WHERE ct.user_id = v_user_id
    AND (
      p_filter = 'all'
      OR (
        p_filter = 'regular'
        AND (
          (ct.transaction_type = 'purchase' AND fpb.expire_at IS NULL)
          OR (ct.transaction_type = 'admin_bonus' AND fpb.expire_at IS NULL)
          OR (ct.transaction_type = 'admin_deduction' AND ct.metadata->>'balance_type' = 'unlimited')
        )
      )
      OR (
        p_filter = 'period_limited'
        AND (
          (fpb.expire_at IS NOT NULL AND ct.transaction_type != 'refund')
          OR (ct.transaction_type = 'admin_deduction' AND ct.metadata->>'balance_type' = 'period_limited')
        )
      )
      OR (p_filter = 'usage' AND ct.transaction_type IN ('consumption', 'refund'))
    );

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_count(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_count(UUID, TEXT) TO service_role;
