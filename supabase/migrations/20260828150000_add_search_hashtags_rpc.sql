-- 入力中のタグ候補（前方一致）を返す関数。
--
-- 使用回数は「いま公開中の投稿での件数」で数える。全件で数えると、取消・公開停止
-- された投稿にしか使われていないタグが候補に残り続け、押しても 0 件になる。
--
-- 詳細は docs/planning/hashtag-search-implementation-plan.md の Phase 6c

BEGIN;

SET LOCAL lock_timeout = '3s';

-- LIKE のワイルドカードを無効化する。これが無いと `%` だけの入力が全件に当たる。
CREATE OR REPLACE FUNCTION public.escape_like_prefix(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT replace(replace(replace(coalesce(p_input, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- ⚠️ p_prefix は**正規化済み**（NFKC + 小文字化）の値を渡すこと。
-- SQL 側で lower() すると、JS の toLowerCase と結果が食い違う言語
-- （トルコ語の İ、ギリシャ語の語末シグマ）で候補が出なくなる。
-- 正規化は lib/hashtag.ts の normalizeHashtag が正本。
CREATE OR REPLACE FUNCTION public.search_hashtags(
  p_prefix text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (name text, post_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.name, count(*) AS post_count
  FROM public.hashtags h
  JOIN public.post_hashtags ph ON ph.hashtag_id = h.id
  JOIN public.generated_images g ON g.id = ph.post_id
  WHERE g.is_posted IS TRUE
    AND g.moderation_status = 'visible'
    AND h.name_normalized LIKE public.escape_like_prefix(p_prefix) || '%'
  GROUP BY h.id, h.name
  ORDER BY count(*) DESC, h.name ASC
  LIMIT least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

-- ⚠️ 新規関数の EXECUTE は PUBLIC に既定付与される。GRANT だけでは閉じない。
REVOKE ALL ON FUNCTION public.escape_like_prefix(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.escape_like_prefix(text) FROM anon;
REVOKE ALL ON FUNCTION public.escape_like_prefix(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.escape_like_prefix(text) TO service_role;

REVOKE ALL ON FUNCTION public.search_hashtags(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_hashtags(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.search_hashtags(text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_hashtags(text, integer) TO service_role;

COMMENT ON FUNCTION public.search_hashtags(text, integer) IS
  '入力中のタグ候補。公開中の投稿での使用回数順。p_prefix は正規化済みを渡す。呼び出しは service_role のみ(段階公開の判定はアプリ側)';

-- 前方一致のためのインデックス。text_pattern_ops で LIKE 'x%' が引ける。
CREATE INDEX IF NOT EXISTS idx_hashtags_name_normalized_prefix
  ON public.hashtags (name_normalized text_pattern_ops);

NOTIFY pgrst, 'reload schema';

COMMIT;
