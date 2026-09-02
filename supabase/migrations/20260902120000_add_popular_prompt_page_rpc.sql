-- ===============================================
-- 🔥人気のプロンプト: 表示用のページ取得 RPC
-- ===============================================
-- 計画書: docs/planning/popular-prompts-tab-implementation-plan.md (Phase 2)
--
-- ⭐ 除外はページングより「前」に適用する。
--    「順位取得 → 投稿取得 → 除外」の順にすると、20 件取ってから数件を
--    ブロック・通報で落とした時点で hasMore=false になり、一覧に穴が空く。
--    順位テーブルと generated_images を SQL で結合し、公開条件・ブロック・通報を
--    適用してから LIMIT/OFFSET する（現行 getPosts と同じ作法）。
--
-- ⭐ 公開条件はここで「毎回」引き直す。
--    順位は最大 1 時間前のスナップショットなので、cron 実行後に
--    投稿取消・非公開化・モデレーションで消えた投稿がテーブルに残りうる。
--    is_posted / moderation_status を join 先の現在値で再確認する。
--
-- popular_prompt_rankings は RLS 全拒否のため、この関数（SECURITY DEFINER）が
-- 唯一の読み出し経路になる。EXECUTE は service_role のみ。
-- p_viewer_id はサーバー側の getUser() から解決した値だけを渡すこと
-- （クライアントのリクエストから受け取らない）。

CREATE OR REPLACE FUNCTION public.get_popular_prompt_page(
  p_viewer_id UUID,
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  post_id UUID,
  rank_position INT,
  is_new BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT r.post_id, r.position AS rank_position, r.is_new
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
  '🔥人気のプロンプトの1ページ分を順位順に返す。除外(ブロック/通報/非公開)を LIMIT より前に適用する。service_role のみ';

-- ⭐ Supabase は public スキーマの関数に anon / authenticated への EXECUTE を
--    既定で自動付与する (= CREATE した瞬間に穴が空く)。必ず剥がす。
REVOKE ALL ON FUNCTION public.get_popular_prompt_page(UUID, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_popular_prompt_page(UUID, INT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.get_popular_prompt_page(UUID, INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_popular_prompt_page(UUID, INT, INT) TO service_role;

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.get_popular_prompt_page(UUID, INT, INT);
-- ===============================================
