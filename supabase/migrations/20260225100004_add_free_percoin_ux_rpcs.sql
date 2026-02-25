-- UX補助用 RPC: 期限一覧・今月末失効・通知対象
-- 認証ユーザーは auth.uid() で自分のデータのみ取得可能

-- 6.1 期限が近い無償コイン一覧（認証ユーザー自身のデータのみ）
CREATE OR REPLACE FUNCTION public.get_free_percoin_batches_expiring(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(id UUID, user_id UUID, remaining_amount INTEGER, expire_at TIMESTAMPTZ, source TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
BEGIN
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

-- 6.2 今月末に失効予定のコイン数（JST 基準、認証ユーザー自身のデータのみ）
CREATE OR REPLACE FUNCTION public.get_expiring_this_month_count(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(expiring_this_month BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
BEGIN
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

-- 6.3 失効通知対象ユーザー抽出（7日以内に失効するバッチを持つユーザー）
-- 管理者のみ呼び出し可能とする想定（アプリ層で requireAdmin チェック）
CREATE OR REPLACE FUNCTION public.get_expiration_notification_targets()
RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT fpb.user_id
  FROM free_percoin_batches fpb
  WHERE fpb.remaining_amount > 0
    AND fpb.expire_at BETWEEN now() AND now() + interval '7 days';
END;
$$;
