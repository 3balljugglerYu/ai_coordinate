-- get_expiration_notification_targets: service_role のみ実行可能に制限
-- ユーザー列挙攻撃を防ぐため、認証ユーザーからの直接呼び出しを禁止

CREATE OR REPLACE FUNCTION public.get_expiration_notification_targets()
RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 認可: service_role（auth.uid() IS NULL）のみ許可
  IF auth.uid() IS NOT NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT fpb.user_id
  FROM free_percoin_batches fpb
  WHERE fpb.remaining_amount > 0
    AND fpb.expire_at BETWEEN now() AND now() + interval '7 days';
END;
$$;

-- 実行権限: anon, authenticated から剥奪
REVOKE EXECUTE ON FUNCTION public.get_expiration_notification_targets() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_expiration_notification_targets() FROM authenticated;

-- service_role に明示的に付与（createAdminClient で呼び出し可能にする）
GRANT EXECUTE ON FUNCTION public.get_expiration_notification_targets() TO service_role;
