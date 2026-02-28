-- 無償ペルコイン残量調整機能のロールバック
-- 1. admin_adjust_free_percoin_batch RPC を削除
-- 2. get_free_percoin_batches_expiring を元の戻り値（amount なし）に戻す

DROP FUNCTION IF EXISTS public.admin_adjust_free_percoin_batch(UUID, INTEGER);

-- get_free_percoin_batches_expiring を元の形式に戻す（amount を戻り値から削除）
DROP FUNCTION IF EXISTS public.get_free_percoin_batches_expiring(UUID);

CREATE FUNCTION public.get_free_percoin_batches_expiring(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(id UUID, user_id UUID, remaining_amount INTEGER, expire_at TIMESTAMPTZ, source TEXT)
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
    AND fpb.expire_at > now()
  ORDER BY fpb.expire_at ASC;
END;
$$;
