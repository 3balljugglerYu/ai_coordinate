-- 生成済みプリセットID(企画カードの「生成済み ✓」判定用)を DB 側 DISTINCT で返す RPC。
--
-- 背景:
--   /style の企画(コレクション)カードで「生成した/まだ」を見分けるため、本人が
--   生成済みのプリセットID集合が必要。以前はアプリ側で image_jobs を最大1000行取得し
--   メモリで new Set していたが、
--     1) PostgREST の 1000 行上限でジョブ多数のユーザーは取りこぼす恐れ、
--     2) 本人データ取得に service_role(RLS バイパス)を使う懸念、
--   があった。DB 側 DISTINCT + SECURITY INVOKER(auth.uid())で両方を解消する。
--
-- 権限:
--   SECURITY INVOKER のため image_jobs の RLS(「本人行のみ SELECT 可」)が適用され、
--   auth.uid() 以外の行は返らない。authenticated ロールに EXECUTE を付与し、
--   通常のセッションクライアント(cookie 認証)から呼ぶ。
-- 生成プリセットIDは style_template_id ではなく generation_metadata->'oneTapStyle'->>'id'
-- に入る(one-tap 生成では style_template_id は NULL)。get_collection_progress /
-- count_distinct_styles_by_category と同じ正典ソースを使う。
CREATE OR REPLACE FUNCTION public.get_generated_preset_ids(
  p_category_keys TEXT[]
)
RETURNS TABLE (preset_id TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ij.generation_metadata -> 'oneTapStyle' ->> 'id'
  FROM public.image_jobs ij
  WHERE ij.user_id = (SELECT auth.uid())
    AND ij.status = 'succeeded'
    AND ij.style_preset_category_key = ANY(p_category_keys)
    AND ij.generation_metadata -> 'oneTapStyle' ->> 'id' IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_generated_preset_ids(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_generated_preset_ids(TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.get_generated_preset_ids(TEXT[]) IS
  'auth.uid() が指定カテゴリで生成済み(succeeded)のプリセットID(style_template_id)を DISTINCT で返す。企画カードの生成済み✓判定用。';
