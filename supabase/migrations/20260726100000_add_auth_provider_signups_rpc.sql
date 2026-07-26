-- /admin ダッシュボード「ログイン方法別構成」用: 認証プロバイダ別の登録情報を返す RPC。
--
-- auth スキーマは PostgREST から直接参照できないため、SECURITY DEFINER で
-- 必要最小限（登録日時 + プロバイダ名のみ、user_id や email は返さない）を公開する。
-- EXECUTE は service_role に限定し、サーバー側
-- (features/admin-dashboard/lib/get-admin-dashboard-data.ts の admin client) からのみ呼ぶ。
-- get_style_generate_counts と同方針。
CREATE OR REPLACE FUNCTION public.get_auth_provider_signups()
RETURNS TABLE (created_at TIMESTAMPTZ, provider TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.created_at,
    COALESCE(NULLIF(u.raw_app_meta_data->>'provider', ''), 'email') AS provider
  FROM auth.users u
  WHERE u.deleted_at IS NULL
    AND COALESCE(u.is_anonymous, FALSE) = FALSE;
$$;

REVOKE ALL ON FUNCTION public.get_auth_provider_signups() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_provider_signups() FROM anon;
REVOKE ALL ON FUNCTION public.get_auth_provider_signups() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_provider_signups() TO service_role;

COMMENT ON FUNCTION public.get_auth_provider_signups() IS
  'service_role専用。全ユーザー(匿名・削除済み除く)の登録日時と認証プロバイダを返す。/admin ログイン方法別構成用';
