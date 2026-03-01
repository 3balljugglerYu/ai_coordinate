-- ===============================================
-- Add get_follow_counts function
-- フォロー数・フォロワー数を1回のクエリで取得する関数
-- ===============================================

CREATE OR REPLACE FUNCTION public.get_follow_counts(p_user_id uuid)
RETURNS TABLE(following_count bigint, follower_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.follows WHERE follower_id = p_user_id)::bigint AS following_count,
    (SELECT COUNT(*) FROM public.follows WHERE followee_id = p_user_id)::bigint AS follower_count;
$$;

-- 関数の説明を追加
COMMENT ON FUNCTION public.get_follow_counts(uuid) IS '指定されたユーザーのフォロー数とフォロワー数を1回のクエリで取得する';

