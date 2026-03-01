-- 取引履歴の総件数を取得（ページネーション用）

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
    AND (p_filter = 'all' OR (p_filter = 'period_limited' AND fpb.id IS NOT NULL));

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_count(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_transactions_count(UUID, TEXT) TO service_role;
