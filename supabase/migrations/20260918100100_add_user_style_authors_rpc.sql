-- ===============================================
-- User ORIGINAL (/user-styles): 作者チップ（フォロー中）
-- ===============================================
-- 計画書: docs/planning/user-original-styles-implementation-plan.md ADR-011
--
-- チップに出すのは「閲覧者がフォローしていて、かつ**その閲覧者に実際に見える**
-- 掲載対象を1件以上持つ作者」だけ。並びはその作者の最新の掲載対象投稿が新しい順。
--
-- フォロー必須の仕様のため、この集合は「いますぐ使えるプロンプトの作者」と一致する。
--
-- ===============================================
-- ⭐⭐ なぜ p_viewer_id 基準の除外をここでも通すのか ⭐⭐
-- ===============================================
-- PR #638 レビュー#3 の指摘。可否関数（validate_derived_prompt_source）を通すだけでは
-- 足りない。実測で確認した事実:
--
--   * validate_derived_prompt_source は **post_reports を一切見ていない**（出現0回）
--   * ブロック判定は「原作者 vs requester」の組だけを見るので、
--     requester = 原作者（＝内在的な可否を取るための手）にすると自分対自分になり無効化される
--
-- そのため、たとえば「フォロー中の作者の唯一の掲載投稿を閲覧者が通報した」場合、
-- この関数が可否だけを見ていると**チップは返るのに、一覧RPCは投稿を除外するので
-- 押すと空になる**。一覧と同じ閲覧者基準の除外を、EXISTS と最新日時を出す**前に**通す。
--
-- ⭐ 下の WHERE は get_user_style_page の CANONICAL LISTING PREDICATE と
--    **一字一句同じ**にすること。片方だけ変えるとチップと中身が食い違う。
-- ===============================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.get_user_style_followed_authors(
  p_viewer_id UUID,
  p_limit INT
)
RETURNS TABLE (
  author_id UUID,
  nickname TEXT,
  avatar_url TEXT,
  latest_posted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'p_limit は 1..50 の範囲で指定すること (受け取った値: %)', p_limit;
  END IF;

  -- 未ログインにはチップを出さない。エラーではなく空を返す
  -- （チップが出ないだけでページは成立する）。
  IF p_viewer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    f.followee_id AS author_id,
    pr.nickname,
    pr.avatar_url,
    latest.posted_at AS latest_posted_at
  FROM public.follows f
  JOIN public.profiles pr ON pr.user_id = f.followee_id
  -- CROSS JOIN なので、見える掲載対象を1件も持たない作者はここで落ちる
  -- （押すと空になるチップを作らないため。LEFT JOIN にしないこと）。
  CROSS JOIN LATERAL (
    SELECT g.posted_at
    FROM public.generated_images g
    CROSS JOIN LATERAL public.validate_derived_prompt_source(g.id, g.user_id) AS v
    -- ⭐ CANONICAL LISTING PREDICATE（get_user_style_page と同じ）
    WHERE g.user_id = f.followee_id
      AND g.generation_type = 'free'
      AND g.is_posted = true
      AND g.moderation_status = 'visible'
      AND g.source_post_id IS NULL
      AND g.user_id IS NOT NULL
      AND g.posted_at IS NOT NULL
      AND g.pre_generation_storage_path IS NOT NULL
      AND g.show_before_image IS TRUE
      -- ⭐ 一覧と同じ閲覧者基準の除外（ファイル冒頭の理由を参照）
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_blocks b
        WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = g.user_id)
           OR (b.blocked_id = p_viewer_id AND b.blocker_id = g.user_id)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.post_reports rep
        WHERE rep.reporter_id = p_viewer_id
          AND rep.post_id = g.id
      )
      AND v.is_available
    ORDER BY g.posted_at DESC, g.id DESC
    LIMIT 1
  ) AS latest
  WHERE f.follower_id = p_viewer_id
  -- 最新の掲載対象投稿が新しい作者から並べる（更新している人が手前に来る）。
  -- 同時刻は author_id で固定して順序を一意にする。
  ORDER BY latest.posted_at DESC, f.followee_id DESC
  LIMIT p_limit;
END;
$function$;

COMMENT ON FUNCTION public.get_user_style_followed_authors(UUID, INT) IS
  '/user-styles の作者チップ。閲覧者がフォローし、かつ閲覧者に見える掲載対象を1件以上持つ作者を最新投稿順に返す。一覧と同じ閲覧者基準の除外を通す。service_role のみ';

REVOKE ALL ON FUNCTION public.get_user_style_followed_authors(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_style_followed_authors(UUID, INT) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_style_followed_authors(UUID, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_style_followed_authors(UUID, INT) TO service_role;

COMMIT;

-- ⭐ PostgREST のスキーマキャッシュを明示的に再読み込みさせる（PGRST202 対策）。
NOTIFY pgrst, 'reload schema';

-- ===============================================
-- DOWN: DROP FUNCTION public.get_user_style_followed_authors(UUID, INT);
-- ===============================================
