-- 取引履歴フィルタを拡張: すべて / 通常 / 期間限定 / 利用分
-- 利用分 = consumption + refund

CREATE OR REPLACE FUNCTION public.get_percoin_transactions_with_expiry(
  p_user_id UUID DEFAULT NULL,
  p_filter TEXT DEFAULT 'all',
  p_sort TEXT DEFAULT 'created_at',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  amount INTEGER,
  transaction_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  expire_at TIMESTAMPTZ
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
  SELECT ct.id, ct.amount, ct.transaction_type, ct.metadata, ct.created_at, fpb.expire_at
  FROM credit_transactions ct
  LEFT JOIN free_percoin_batches fpb
    ON fpb.credit_transaction_id = ct.id AND fpb.user_id = ct.user_id
  WHERE ct.user_id = v_user_id
    AND (
      p_filter = 'all'
      OR (p_filter = 'regular' AND ct.transaction_type = 'purchase')
      OR (p_filter = 'period_limited' AND fpb.id IS NOT NULL)
      OR (p_filter = 'usage' AND ct.transaction_type IN ('consumption', 'refund'))
    )
  ORDER BY ct.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_percoin_transactions_count(
  p_user_id UUID DEFAULT NULL,
  p_filter TEXT DEFAULT 'all'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
      OR (p_filter = 'regular' AND ct.transaction_type = 'purchase')
      OR (p_filter = 'period_limited' AND fpb.id IS NOT NULL)
      OR (p_filter = 'usage' AND ct.transaction_type IN ('consumption', 'refund'))
    );

  RETURN v_count;
END;
$$;
