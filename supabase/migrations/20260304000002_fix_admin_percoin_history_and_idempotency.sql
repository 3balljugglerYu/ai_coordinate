-- admin percoin の履歴分類を metadata 基準に寄せ、
-- admin_deduction の冪等性を DB 制約で担保する follow-up migration

UPDATE public.credit_transactions ct
SET metadata = COALESCE(ct.metadata, '{}'::jsonb)
  || jsonb_build_object('balance_type', 'period_limited')
  || COALESCE(
    (
      SELECT jsonb_build_object('expire_at', fpb.expire_at)
      FROM public.free_percoin_batches fpb
      WHERE fpb.credit_transaction_id = ct.id
        AND fpb.user_id = ct.user_id
        AND fpb.expire_at IS NOT NULL
      ORDER BY fpb.granted_at DESC
      LIMIT 1
    ),
    '{}'::jsonb
  )
WHERE ct.transaction_type = 'admin_bonus'
  AND NOT (COALESCE(ct.metadata, '{}'::jsonb) ? 'balance_type');

UPDATE public.credit_transactions ct
SET metadata = COALESCE(ct.metadata, '{}'::jsonb)
  || jsonb_build_object('balance_type', 'unlimited')
WHERE ct.transaction_type = 'admin_deduction'
  AND NOT (COALESCE(ct.metadata, '{}'::jsonb) ? 'balance_type');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT metadata->>'idempotency_key' AS idempotency_key
      FROM public.credit_transactions
      WHERE transaction_type = 'admin_deduction'
        AND metadata->>'idempotency_key' IS NOT NULL
      GROUP BY 1
      HAVING COUNT(*) > 1
    ) dupes
  ) THEN
    RAISE EXCEPTION 'Cannot create unique admin_deduction idempotency index because duplicate idempotency_key values already exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.idx_credit_transactions_admin_deduction_idempotency;

CREATE UNIQUE INDEX idx_credit_transactions_admin_deduction_idempotency
  ON public.credit_transactions (((metadata ->> 'idempotency_key'::text)))
  WHERE transaction_type = 'admin_deduction'
    AND (metadata ->> 'idempotency_key'::text) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_admin_balance_type_created
  ON public.credit_transactions (
    user_id,
    transaction_type,
    ((metadata ->> 'balance_type'::text)),
    created_at DESC
  )
  WHERE transaction_type IN ('admin_bonus', 'admin_deduction')
    AND (metadata ->> 'balance_type'::text) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.deduct_percoins_admin(
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

  -- 同一 idempotency key の同時実行を直列化し、unique index を最後の砦にする
  PERFORM pg_advisory_xact_lock(
    hashtext('credit_transactions_admin_deduction'),
    hashtext(p_idempotency_key)
  );

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
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ユーザーが保有している期間限定のペルコインが、設定したペルコイン数より少ないです。',
        DETAIL = 'INSUFFICIENT_PERIOD_LIMITED_PERCOIN';
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
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ユーザーが保有している無期限のペルコインが、設定したペルコイン数より少ないです。',
        DETAIL = 'INSUFFICIENT_UNLIMITED_PERCOIN';
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
          OR (
            ct.transaction_type = 'admin_bonus'
            AND COALESCE(ct.metadata->>'balance_type', 'period_limited') = 'unlimited'
          )
          OR (
            ct.transaction_type = 'admin_deduction'
            AND COALESCE(ct.metadata->>'balance_type', 'unlimited') = 'unlimited'
          )
        )
      )
      OR (
        p_filter = 'period_limited'
        AND (
          (
            fpb.expire_at IS NOT NULL
            AND ct.transaction_type NOT IN ('refund', 'admin_bonus', 'admin_deduction')
          )
          OR (
            ct.transaction_type = 'admin_bonus'
            AND COALESCE(ct.metadata->>'balance_type', 'period_limited') = 'period_limited'
          )
          OR (
            ct.transaction_type = 'admin_deduction'
            AND COALESCE(ct.metadata->>'balance_type', 'unlimited') = 'period_limited'
          )
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
          OR (
            ct.transaction_type = 'admin_bonus'
            AND COALESCE(ct.metadata->>'balance_type', 'period_limited') = 'unlimited'
          )
          OR (
            ct.transaction_type = 'admin_deduction'
            AND COALESCE(ct.metadata->>'balance_type', 'unlimited') = 'unlimited'
          )
        )
      )
      OR (
        p_filter = 'period_limited'
        AND (
          (
            fpb.expire_at IS NOT NULL
            AND ct.transaction_type NOT IN ('refund', 'admin_bonus', 'admin_deduction')
          )
          OR (
            ct.transaction_type = 'admin_bonus'
            AND COALESCE(ct.metadata->>'balance_type', 'period_limited') = 'period_limited'
          )
          OR (
            ct.transaction_type = 'admin_deduction'
            AND COALESCE(ct.metadata->>'balance_type', 'unlimited') = 'period_limited'
          )
        )
      )
      OR (p_filter = 'usage' AND ct.transaction_type IN ('consumption', 'refund'))
    );

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_count(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_count(UUID, TEXT) TO service_role;
