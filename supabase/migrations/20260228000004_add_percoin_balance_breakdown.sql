-- get_percoin_balance_breakdown: 保有ペルコインの内訳（total, regular, period_limited）を返す
-- regular = paid_balance（購入分）、period_limited = 期間限定ペルコインの合計
-- p_user_id: 認証ユーザーが他ユーザーを指定した場合は拒否。NULL の場合は auth.uid() を使用

CREATE OR REPLACE FUNCTION public.get_percoin_balance_breakdown(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(total INTEGER, regular INTEGER, period_limited BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- 認可: 認証ユーザーが他ユーザーのデータを指定した場合は拒否
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
    COALESCE(uc.paid_balance, 0)::INTEGER AS regular,
    COALESCE((
      SELECT SUM(fpb.remaining_amount)
      FROM free_percoin_batches fpb
      WHERE fpb.user_id = v_user_id
        AND fpb.remaining_amount > 0
        AND fpb.expire_at > now()
    ), 0)::BIGINT AS period_limited
  FROM user_credits uc
  WHERE uc.user_id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_percoin_balance_breakdown(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_balance_breakdown(UUID) TO service_role;
