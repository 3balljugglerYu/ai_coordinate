-- get_free_percoin_batches_expiring, get_expiring_this_month_count に認可チェックを追加
-- service_role（auth.uid() IS NULL）: 任意の p_user_id で検索可能（管理画面用）
-- 認証ユーザー: p_user_id が NULL または auth.uid() と一致する場合のみ許可

-- 6.1 期限が近い無償コイン一覧
CREATE OR REPLACE FUNCTION public.get_free_percoin_batches_expiring(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(id UUID, user_id UUID, remaining_amount INTEGER, expire_at TIMESTAMPTZ, source TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
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
  SELECT fpb.id, fpb.user_id, fpb.remaining_amount, fpb.expire_at, fpb.source
  FROM free_percoin_batches fpb
  WHERE fpb.user_id = v_user_id
    AND fpb.remaining_amount > 0
    AND fpb.expire_at > now()
  ORDER BY fpb.expire_at ASC;
END;
$$;

-- 6.2 今月末に失効予定のコイン数（JST 基準）
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
  -- 認可: 認証ユーザーが他ユーザーのデータを指定した場合は拒否
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
    AND fpb.expire_at >= v_month_start
    AND fpb.expire_at < v_month_end;
END;
$$;
