-- 画像生成失敗時の返金を「消費明細ベース」で巻き戻すための基盤を追加
-- - generation_percoin_allocations テーブル新設
-- - deduct_free_percoins: 消費明細保存 + 消費順の決定化
-- - refund_percoins: allocation優先返金 + legacy fallback
-- - get_percoin_balance_breakdown: paid / unlimited_bonus を返却
-- - get_percoin_transactions_with_expiry / count: batch集約ベースに変更

CREATE TABLE IF NOT EXISTS public.generation_percoin_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.image_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consumption_transaction_id UUID NOT NULL REFERENCES public.credit_transactions(id) ON DELETE CASCADE,
  refund_transaction_id UUID NULL REFERENCES public.credit_transactions(id) ON DELETE SET NULL,
  allocation_kind TEXT NOT NULL CHECK (
    allocation_kind IN ('period_limited', 'unlimited_bonus', 'paid')
  ),
  source_batch_id UUID NULL,
  source_expire_at TIMESTAMPTZ NULL,
  source_granted_at TIMESTAMPTZ NULL,
  source_source TEXT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  restored_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT generation_percoin_allocations_paid_source_check
    CHECK (
      (allocation_kind = 'paid' AND source_batch_id IS NULL)
      OR
      (allocation_kind IN ('period_limited', 'unlimited_bonus') AND source_batch_id IS NOT NULL)
    )
);

ALTER TABLE public.generation_percoin_allocations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_gpa_job_id
  ON public.generation_percoin_allocations (job_id);

CREATE INDEX IF NOT EXISTS idx_gpa_consumption_tx_id
  ON public.generation_percoin_allocations (consumption_transaction_id);

CREATE INDEX IF NOT EXISTS idx_gpa_refund_tx_id
  ON public.generation_percoin_allocations (refund_transaction_id)
  WHERE refund_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gpa_unrestored
  ON public.generation_percoin_allocations (job_id, consumption_transaction_id)
  WHERE restored_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gpa_unique_source_batch_per_consumption
  ON public.generation_percoin_allocations (consumption_transaction_id, source_batch_id)
  WHERE source_batch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gpa_unique_paid_per_consumption
  ON public.generation_percoin_allocations (consumption_transaction_id, allocation_kind)
  WHERE allocation_kind = 'paid';

ALTER TABLE public.free_percoin_batches
  DROP CONSTRAINT IF EXISTS free_percoin_batches_expire_required_non_admin_bonus;

ALTER TABLE public.free_percoin_batches
  ADD CONSTRAINT free_percoin_batches_expire_required_non_admin_bonus
  CHECK (source IN ('admin_bonus', 'refund') OR expire_at IS NOT NULL);

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
  v_from_period_limited INTEGER := 0;
  v_from_unlimited_bonus INTEGER := 0;
  v_from_promo INTEGER := 0;
  v_from_paid INTEGER := 0;
  v_remaining INTEGER;
  v_deduct INTEGER;
  v_paid_balance INTEGER;
  v_new_balance INTEGER;
  v_job_id TEXT;
  v_job_id_uuid UUID;
  v_is_image_generation_job BOOLEAN := FALSE;
  v_consumption_tx_id UUID;
  v_allocation_items JSONB := '[]'::jsonb;
  r RECORD;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller must be service role or target user (auth.uid() = p_user_id)';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  v_job_id := NULLIF(TRIM(COALESCE(p_metadata->>'job_id', '')), '');
  IF v_job_id IS NOT NULL THEN
    IF v_job_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid job_id: %', v_job_id;
    END IF;
    v_job_id_uuid := v_job_id::UUID;
    v_is_image_generation_job := TRUE;
  END IF;

  IF v_job_id IS NOT NULL THEN
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
    SELECT id, remaining_amount, expire_at, granted_at, source
    FROM free_percoin_batches
    WHERE user_id = p_user_id
      AND remaining_amount > 0
      AND (expire_at IS NULL OR expire_at > now())
    ORDER BY expire_at ASC NULLS LAST, granted_at ASC, id ASC
    FOR UPDATE
  ) LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct := LEAST(r.remaining_amount, v_remaining);
    v_remaining := v_remaining - v_deduct;

    IF r.expire_at IS NULL THEN
      v_from_unlimited_bonus := v_from_unlimited_bonus + v_deduct;
    ELSE
      v_from_period_limited := v_from_period_limited + v_deduct;
    END IF;

    UPDATE free_percoin_batches
    SET remaining_amount = remaining_amount - v_deduct,
        updated_at = now()
    WHERE id = r.id;

    IF v_is_image_generation_job AND v_deduct > 0 THEN
      v_allocation_items := v_allocation_items || jsonb_build_array(
        jsonb_build_object(
          'allocation_kind', CASE WHEN r.expire_at IS NULL THEN 'unlimited_bonus' ELSE 'period_limited' END,
          'source_batch_id', r.id,
          'source_expire_at', r.expire_at,
          'source_granted_at', r.granted_at,
          'source_source', r.source,
          'amount', v_deduct
        )
      );
    END IF;

    DELETE FROM free_percoin_batches
    WHERE id = r.id AND remaining_amount = 0;
  END LOOP;

  v_from_paid := v_remaining;
  IF v_from_paid > v_paid_balance THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  v_from_promo := v_from_period_limited + v_from_unlimited_bonus;

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
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'from_promo', v_from_promo,
      'from_paid', v_from_paid,
      'from_period_limited', v_from_period_limited,
      'from_unlimited_bonus', v_from_unlimited_bonus
    )
  )
  RETURNING id INTO v_consumption_tx_id;

  IF v_is_image_generation_job THEN
    INSERT INTO public.generation_percoin_allocations (
      job_id,
      user_id,
      consumption_transaction_id,
      allocation_kind,
      source_batch_id,
      source_expire_at,
      source_granted_at,
      source_source,
      amount
    )
    SELECT
      v_job_id_uuid,
      p_user_id,
      v_consumption_tx_id,
      item->>'allocation_kind',
      (item->>'source_batch_id')::UUID,
      (item->>'source_expire_at')::TIMESTAMPTZ,
      (item->>'source_granted_at')::TIMESTAMPTZ,
      item->>'source_source',
      (item->>'amount')::INTEGER
    FROM jsonb_array_elements(v_allocation_items) AS item;

    IF v_from_paid > 0 THEN
      INSERT INTO public.generation_percoin_allocations (
        job_id,
        user_id,
        consumption_transaction_id,
        allocation_kind,
        amount
      )
      VALUES (
        v_job_id_uuid,
        p_user_id,
        v_consumption_tx_id,
        'paid',
        v_from_paid
      );
    END IF;
  END IF;

  SELECT uc.balance INTO v_new_balance
  FROM user_credits uc
  WHERE uc.user_id = p_user_id;

  RETURN QUERY SELECT v_new_balance, v_from_promo, v_from_paid;
END;
$function$;

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
  v_now TIMESTAMPTZ := now();
  v_expire_at TIMESTAMPTZ;
  v_tx_id UUID;
  v_job_id TEXT;
  v_job_uuid UUID;
  v_consumption_tx_id UUID;
  v_allocation_total INTEGER := 0;
  v_to_period_limited INTEGER := 0;
  v_to_unlimited_bonus INTEGER := 0;
  v_to_paid INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Unauthorized: refund_percoins can only be called with service role';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid refund amount';
  END IF;

  v_job_id := NULLIF(TRIM(COALESCE(p_job_id, '')), '');
  IF v_job_id IS NOT NULL THEN
    IF v_job_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid job_id: %', v_job_id;
    END IF;
    v_job_uuid := v_job_id::UUID;

    IF EXISTS (
      SELECT 1 FROM credit_transactions
      WHERE user_id = p_user_id
        AND transaction_type = 'refund'
        AND metadata->>'job_id' = v_job_id
    ) THEN
      RETURN;
    END IF;

    SELECT ct.id
      INTO v_consumption_tx_id
    FROM credit_transactions ct
    WHERE ct.user_id = p_user_id
      AND ct.transaction_type = 'consumption'
      AND ct.metadata->>'job_id' = v_job_id
    ORDER BY ct.created_at DESC
    LIMIT 1;

    IF v_consumption_tx_id IS NOT NULL THEN
      SELECT COALESCE(SUM(gpa.amount), 0)::INTEGER
        INTO v_allocation_total
      FROM generation_percoin_allocations gpa
      WHERE gpa.consumption_transaction_id = v_consumption_tx_id
        AND gpa.user_id = p_user_id
        AND gpa.job_id = v_job_uuid
        AND gpa.restored_at IS NULL;
    END IF;
  END IF;

  -- allocationベース返金（本流）
  IF v_consumption_tx_id IS NOT NULL AND v_allocation_total > 0 THEN
    IF v_allocation_total != p_amount THEN
      RAISE EXCEPTION 'allocation total mismatch: expected %, got %', v_allocation_total, p_amount;
    END IF;

    SELECT
      COALESCE(SUM(gpa.amount) FILTER (WHERE gpa.allocation_kind = 'period_limited'), 0)::INTEGER,
      COALESCE(SUM(gpa.amount) FILTER (WHERE gpa.allocation_kind = 'unlimited_bonus'), 0)::INTEGER,
      COALESCE(SUM(gpa.amount) FILTER (WHERE gpa.allocation_kind = 'paid'), 0)::INTEGER
    INTO
      v_to_period_limited,
      v_to_unlimited_bonus,
      v_to_paid
    FROM generation_percoin_allocations gpa
    WHERE gpa.consumption_transaction_id = v_consumption_tx_id
      AND gpa.user_id = p_user_id
      AND gpa.job_id = v_job_uuid
      AND gpa.restored_at IS NULL;

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (
      p_user_id,
      p_amount,
      'refund',
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'to_promo', v_to_period_limited + v_to_unlimited_bonus,
        'to_paid', v_to_paid,
        'to_period_limited', v_to_period_limited,
        'to_unlimited_bonus', v_to_unlimited_bonus,
        'job_id', v_job_id,
        'refund_mode', 'allocations'
      )
    )
    RETURNING id INTO v_tx_id;

    IF v_to_period_limited > 0 THEN
      INSERT INTO free_percoin_batches (
        user_id,
        amount,
        remaining_amount,
        granted_at,
        expire_at,
        source,
        credit_transaction_id
      )
      SELECT
        p_user_id,
        SUM(gpa.amount)::INTEGER,
        SUM(gpa.amount)::INTEGER,
        v_now,
        gpa.source_expire_at,
        'refund',
        v_tx_id
      FROM generation_percoin_allocations gpa
      WHERE gpa.consumption_transaction_id = v_consumption_tx_id
        AND gpa.user_id = p_user_id
        AND gpa.job_id = v_job_uuid
        AND gpa.restored_at IS NULL
        AND gpa.allocation_kind = 'period_limited'
      GROUP BY gpa.source_expire_at;
    END IF;

    IF v_to_unlimited_bonus > 0 THEN
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
        v_to_unlimited_bonus,
        v_to_unlimited_bonus,
        v_now,
        NULL,
        'refund',
        v_tx_id
      );
    END IF;

    INSERT INTO user_credits (user_id, balance, paid_balance)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE user_credits
    SET paid_balance = paid_balance + v_to_paid,
        balance = balance + p_amount,
        updated_at = v_now
    WHERE user_id = p_user_id;

    UPDATE generation_percoin_allocations
    SET refund_transaction_id = v_tx_id,
        restored_at = v_now
    WHERE consumption_transaction_id = v_consumption_tx_id
      AND user_id = p_user_id
      AND job_id = v_job_uuid
      AND restored_at IS NULL;

    RETURN;
  END IF;

  -- legacy fallback（allocationが存在しない旧データ向け）
  IF p_to_promo + p_to_paid != p_amount THEN
    RAISE EXCEPTION 'invalid refund amounts';
  END IF;

  INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    p_user_id,
    p_amount,
    'refund',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'to_promo', p_to_promo,
      'to_paid', p_to_paid,
      'to_period_limited', p_to_promo,
      'to_unlimited_bonus', 0,
      'job_id', v_job_id,
      'refund_mode', 'legacy_fallback'
    )
  )
  RETURNING id INTO v_tx_id;

  IF p_to_promo > 0 THEN
    v_expire_at := (
      date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
      + interval '7 months' - interval '1 second'
    ) AT TIME ZONE 'Asia/Tokyo';

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
      p_to_promo,
      p_to_promo,
      v_now,
      v_expire_at,
      'refund',
      v_tx_id
    );
  END IF;

  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE user_credits
  SET paid_balance = paid_balance + p_to_paid,
      balance = balance + p_amount,
      updated_at = v_now
  WHERE user_id = p_user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_percoin_balance_breakdown(UUID);

CREATE FUNCTION public.get_percoin_balance_breakdown(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(
  total INTEGER,
  regular INTEGER,
  paid INTEGER,
  unlimited_bonus BIGINT,
  period_limited BIGINT
)
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
  WITH bonus_summary AS (
    SELECT
      SUM(fpb.remaining_amount) FILTER (WHERE fpb.expire_at IS NULL) AS unlimited,
      SUM(fpb.remaining_amount) FILTER (
        WHERE fpb.expire_at IS NOT NULL AND fpb.expire_at > now()
      ) AS limited
    FROM free_percoin_batches fpb
    WHERE fpb.user_id = v_user_id
      AND fpb.remaining_amount > 0
  )
  SELECT
    COALESCE(uc.balance, 0)::INTEGER AS total,
    (COALESCE(uc.paid_balance, 0) + COALESCE(bs.unlimited, 0))::INTEGER AS regular,
    COALESCE(uc.paid_balance, 0)::INTEGER AS paid,
    COALESCE(bs.unlimited, 0)::BIGINT AS unlimited_bonus,
    COALESCE(bs.limited, 0)::BIGINT AS period_limited
  FROM (SELECT v_user_id AS user_id) target
  LEFT JOIN user_credits uc ON uc.user_id = target.user_id
  CROSS JOIN bonus_summary bs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_percoin_balance_breakdown(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_balance_breakdown(UUID) TO service_role;

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
  WITH batch_summary AS (
    SELECT
      fpb.credit_transaction_id,
      fpb.user_id,
      BOOL_OR(fpb.expire_at IS NOT NULL AND fpb.expire_at > now()) AS has_period_limited,
      BOOL_OR(fpb.expire_at IS NULL) AS has_unlimited,
      MIN(fpb.expire_at) FILTER (WHERE fpb.expire_at IS NOT NULL AND fpb.expire_at > now()) AS expire_at_min,
      MAX(fpb.expire_at) FILTER (WHERE fpb.expire_at IS NOT NULL AND fpb.expire_at > now()) AS expire_at_max
    FROM free_percoin_batches fpb
    WHERE fpb.user_id = v_user_id
      AND fpb.credit_transaction_id IS NOT NULL
    GROUP BY fpb.credit_transaction_id, fpb.user_id
  )
  SELECT
    ct.id,
    ct.amount,
    ct.transaction_type,
    ct.metadata,
    ct.created_at,
    CASE
      WHEN COALESCE(bs.has_unlimited, FALSE) THEN NULL
      WHEN bs.expire_at_min IS NULL THEN NULL
      WHEN bs.expire_at_min = bs.expire_at_max THEN bs.expire_at_min
      ELSE NULL
    END AS expire_at
  FROM credit_transactions ct
  LEFT JOIN batch_summary bs
    ON bs.credit_transaction_id = ct.id
   AND bs.user_id = ct.user_id
  WHERE ct.user_id = v_user_id
    AND (
      p_filter = 'all'
      OR (
        p_filter = 'regular'
        AND (
          (ct.transaction_type = 'purchase' AND NOT COALESCE(bs.has_period_limited, FALSE))
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
            COALESCE(bs.has_period_limited, FALSE)
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
  ORDER BY
    CASE WHEN p_sort = 'expire_at' THEN
      CASE
        WHEN COALESCE(bs.has_unlimited, FALSE) THEN NULL
        WHEN bs.expire_at_min IS NULL THEN NULL
        WHEN bs.expire_at_min = bs.expire_at_max THEN bs.expire_at_min
        ELSE NULL
      END
    END ASC NULLS LAST,
    ct.created_at DESC
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

  WITH batch_summary AS (
    SELECT
      fpb.credit_transaction_id,
      fpb.user_id,
      BOOL_OR(fpb.expire_at IS NOT NULL AND fpb.expire_at > now()) AS has_period_limited
    FROM free_percoin_batches fpb
    WHERE fpb.user_id = v_user_id
      AND fpb.credit_transaction_id IS NOT NULL
    GROUP BY fpb.credit_transaction_id, fpb.user_id
  )
  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM credit_transactions ct
  LEFT JOIN batch_summary bs
    ON bs.credit_transaction_id = ct.id
   AND bs.user_id = ct.user_id
  WHERE ct.user_id = v_user_id
    AND (
      p_filter = 'all'
      OR (
        p_filter = 'regular'
        AND (
          (ct.transaction_type = 'purchase' AND NOT COALESCE(bs.has_period_limited, FALSE))
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
            COALESCE(bs.has_period_limited, FALSE)
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
