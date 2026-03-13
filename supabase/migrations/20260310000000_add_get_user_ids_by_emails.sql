-- メールアドレス配列から user_id と残高を一括取得
-- 一括ペルコイン付与機能で使用
CREATE OR REPLACE FUNCTION public.get_user_ids_by_emails(p_emails text[])
RETURNS TABLE(email text, user_id uuid, balance integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT u.email, u.id, COALESCE(uc.balance, 0)
  FROM auth.users u
  LEFT JOIN public.user_credits uc ON uc.user_id = u.id
  WHERE u.email = ANY(p_emails);
$$;

GRANT EXECUTE ON FUNCTION public.get_user_ids_by_emails(text[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_user_ids_by_emails(text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_ids_by_emails(text[]) FROM authenticated;
