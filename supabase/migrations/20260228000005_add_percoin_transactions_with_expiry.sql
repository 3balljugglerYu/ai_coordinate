-- Phase 3: 取引履歴に有効期限・フィルタ・ソートを追加
-- RPC get_percoin_transactions_with_expiry + idx_fpb_credit_transaction_id

-- 1. JOIN 性能のため credit_transaction_id にインデックス追加
CREATE INDEX IF NOT EXISTS idx_fpb_credit_transaction_id
  ON public.free_percoin_batches (credit_transaction_id)
  WHERE credit_transaction_id IS NOT NULL;

-- 2. 取引履歴取得 RPC（フィルタ・ソート対応）
CREATE OR REPLACE FUNCTION public.get_percoin_transactions_with_expiry(
  p_user_id UUID DEFAULT NULL,
  p_filter TEXT DEFAULT 'all',
  p_sort TEXT DEFAULT 'created_at',
  p_limit INTEGER DEFAULT 10
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
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT ct.id, ct.amount, ct.transaction_type, ct.metadata, ct.created_at, fpb.expire_at
    FROM credit_transactions ct
    LEFT JOIN free_percoin_batches fpb
      ON fpb.credit_transaction_id = ct.id AND fpb.user_id = ct.user_id
    WHERE ct.user_id = v_user_id
      AND (p_filter = 'all' OR (p_filter = 'period_limited' AND fpb.id IS NOT NULL))
    ORDER BY ct.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_with_expiry(UUID, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_with_expiry(UUID, TEXT, TEXT, INTEGER) TO service_role;
