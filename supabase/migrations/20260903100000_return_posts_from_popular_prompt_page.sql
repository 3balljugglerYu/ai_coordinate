-- ===============================================
-- 🔥人気のプロンプト: ページ取得を「1 文」に閉じる
-- ===============================================
-- レビュー指摘（PR #590）への対応。
--
-- ## 何が問題だったか
--
-- 20260902120000 の get_popular_prompt_page は post_id だけを返し、
-- 投稿本体はアプリ側が service_role で **別の SELECT** を発行していた。
-- そのため次の 2 つが起きうる。
--
--   1. 2 文の間に投稿取消・モデレーション・ブロック・通報が起きると、
--      1 文目で通した投稿を 2 文目がそのまま返す（除外が効かない）。
--      2 文目には公開条件が一切付いていなかった。
--   2. 2 文の間に行が消えると取得件数が limit を下回り、
--      route の `hasMore = posts.length === limit` が false になって
--      無限スクロールが途中で止まる。
--
-- 「除外を LIMIT より前に適用する」という本機能の不変条件は、
-- **同じスナップショットで射影まで返して**はじめて保たれる。
--
-- ## どう直したか
--
-- 行そのものを to_jsonb で返す。列を列挙しないので、generated_images に
-- 列が増えても本関数を追随させる必要がない。実データで PostgREST の
-- select=* と同じ形（41 列・同じ型・同じ日時書式）になることを確認済み。
--
-- ⭐ 戻り値の型が変わるため CREATE OR REPLACE では置き換えられない。
--    DROP してから作り直す。**DROP すると EXECUTE 権限が既定（PUBLIC）へ
--    戻る**ので、末尾の REVOKE / GRANT を必ず通すこと。

DROP FUNCTION IF EXISTS public.get_popular_prompt_page(UUID, INT, INT);

CREATE FUNCTION public.get_popular_prompt_page(
  p_viewer_id UUID,
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  post JSONB,
  rank_position INT,
  is_new BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  -- 射影・除外・並び・ページングをすべてこの 1 文で行う。
  -- 呼び出し側は返ってきた post をそのまま使い、追加の SELECT を発行しない。
  SELECT to_jsonb(g) AS post, r.position AS rank_position, r.is_new
  FROM public.popular_prompt_rankings r
  JOIN public.generated_images g ON g.id = r.post_id
  WHERE g.is_posted = true
    -- 順位テーブルには visible のものしか入らないが、cron 実行後に
    -- 状態が変わることがあるので現在値で再確認する。
    AND g.moderation_status = 'visible'
    -- 双方向ブロック。未ログイン (p_viewer_id IS NULL) のときは対象なし。
    AND (
      p_viewer_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.user_blocks b
        WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = g.user_id)
           OR (b.blocked_id = p_viewer_id AND b.blocker_id = g.user_id)
      )
    )
    -- 自分が通報した投稿は自分には出さない。
    AND (
      p_viewer_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.post_reports pr
        WHERE pr.reporter_id = p_viewer_id
          AND pr.post_id = r.post_id
      )
    )
  -- position は UNIQUE だが、読み出しも post_id で二重に固定する。
  ORDER BY r.position, r.post_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

COMMENT ON FUNCTION public.get_popular_prompt_page(UUID, INT, INT) IS
  '🔥人気のプロンプトの1ページ分を、投稿本体ごと順位順に返す。除外(ブロック/通報/非公開)と射影を同一SQL文に閉じる。service_role のみ';

-- ⭐ DROP で既定権限（PUBLIC への EXECUTE）に戻っているので、必ず閉じ直す。
REVOKE ALL ON FUNCTION public.get_popular_prompt_page(UUID, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_popular_prompt_page(UUID, INT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.get_popular_prompt_page(UUID, INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_popular_prompt_page(UUID, INT, INT) TO service_role;

-- ===============================================
-- DOWN: 20260902120000 の定義（post_id のみを返す版）へ戻す。
--       戻す場合も DROP 後の REVOKE / GRANT を忘れないこと。
-- ===============================================
