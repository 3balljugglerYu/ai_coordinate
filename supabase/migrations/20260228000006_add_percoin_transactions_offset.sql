-- 取引履歴 RPC にオフセット（ページネーション）を追加

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

  IF p_sort = 'expire_at' THEN
    RETURN QUERY
    SELECT ct.id, ct.amount, ct.transaction_type, ct.metadata, ct.created_at, fpb.expire_at
    FROM credit_transactions ct
    LEFT JOIN free_percoin_batches fpb
      ON fpb.credit_transaction_id = ct.id AND fpb.user_id = ct.user_id
    WHERE ct.user_id = v_user_id
      AND (p_filter = 'all' OR (p_filter = 'period_limited' AND fpb.id IS NOT NULL))
    ORDER BY fpb.expire_at ASC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
  ELSE
    RETURN QUERY
    SELECT ct.id, ct.amount, ct.transaction_type, ct.metadata, ct.created_at, fpb.expire_at
    FROM credit_transactions ct
    LEFT JOIN free_percoin_batches fpb
      ON fpb.credit_transaction_id = ct.id AND fpb.user_id = ct.user_id
    WHERE ct.user_id = v_user_id
      AND (p_filter = 'all' OR (p_filter = 'period_limited' AND fpb.id IS NOT NULL))
    ORDER BY ct.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$$;

-- 旧シグネチャを削除し、新シグネチャに権限付与
DROP FUNCTION IF EXISTS public.get_percoin_transactions_with_expiry(UUID, TEXT, TEXT, INTEGER);

GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_with_expiry(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_with_expiry(UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role;
