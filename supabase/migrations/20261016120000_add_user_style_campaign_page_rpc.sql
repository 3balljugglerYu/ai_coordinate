-- ===============================================
-- みんなのカタログ(/user-styles): ハッシュタグ企画の対象作品だけのタブ(1ページを「1文」で返す)
-- ===============================================
-- 2026-10-16 ユーザー指示: 企画ページの「カタログから生成する」を押したら、ハッシュタグの検索ではなく
-- みんなのカタログの「すべて(新着順)」の右に「#うちの子のベストショット」のタブを出し、そこで絞り込む。
--
-- ## なぜ新しい関数にするか
--
-- get_user_style_page(20260918100000)と同じ理由で、絞り込み・除外・並び・ページング・射影を
-- **1文に閉じる**(取得したあとでアプリが絞ると、20件取って数件落とした時点で hasMore が false になり
-- 一覧に穴が空く。ID だけ返して別文で引くと、その間の取消・モデレーション・ブロック・通報の除外が効かない)。
-- get_user_style_page に引数を足すと署名が変わり、権限が既定(PUBLIC)に戻るおそれがあるので、
-- 今ある関数には手を入れず、別の関数として足す。
--
-- ## 何を返すか
--
-- - みんなのカタログの掲載条件(CANONICAL LISTING PREDICATE)を満たす投稿のうち、
-- - 企画の応募作の記録(hashtag_campaign_submissions)にあり、
-- - いまも企画のハッシュタグが付いている投稿(企画ページの一覧 list_hashtag_campaign_submissions と同じ)
-- を、すべて(新着順)と同じ (posted_at, id) の keyset で新しい順に返す。
--
-- ⭐ 掲載条件は get_user_style_page / get_user_style_followed_authors と**一字一句同じ**にすること
-- (20260918100000 の冒頭を参照)。生成前の画像を出していない応募作は、みんなのカタログには並ばないので
-- このタブにも出ない(数える側=口数・審査は、これまでどおり応募作の記録で見る)。
--
-- 応募作の記録から引く(数百件)ので、カタログ全体をなめずに済む。
-- 期間の判定はしない(記録は期間中の投稿にしか付かない)。タブを出すかは画面が期間で決める。
-- ===============================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.get_user_style_campaign_page(
  p_viewer_id UUID,
  p_campaign_key TEXT,
  p_limit INT,
  p_cursor_posted_at TIMESTAMPTZ,
  p_cursor_id UUID
)
RETURNS TABLE (
  post JSONB,
  usage_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_has_cursor BOOLEAN := p_cursor_posted_at IS NOT NULL AND p_cursor_id IS NOT NULL;
BEGIN
  -- 呼び出し側の取り違えは黙って丸めず、ここで落とす(get_user_style_page と同じ)
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 40 THEN
    RAISE EXCEPTION 'p_limit は 1..40 の範囲で指定すること (受け取った値: %)', p_limit;
  END IF;

  IF p_campaign_key IS NULL THEN
    RAISE EXCEPTION 'p_campaign_key を指定すること';
  END IF;

  IF (p_cursor_posted_at IS NULL) <> (p_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'cursor は posted_at と id を両方渡すこと';
  END IF;

  RETURN QUERY
  SELECT to_jsonb(g) AS post, u.usage_count
  FROM public.hashtag_campaigns c
  JOIN public.hashtag_campaign_submissions s
    ON s.campaign_key = c.key
  JOIN public.generated_images g
    ON g.id = s.post_id
  CROSS JOIN LATERAL public.validate_derived_prompt_source(g.id, g.user_id) AS v
  CROSS JOIN LATERAL (
    SELECT public.get_prompt_usage_count(g.id) AS usage_count
  ) AS u
  WHERE c.key = p_campaign_key
    -- ⭐ CANONICAL LISTING PREDICATE(20260918100000 の冒頭を参照。一字一句同じ)
    AND g.generation_type = 'free'
    AND g.is_posted = true
    AND g.moderation_status = 'visible'
    AND g.source_post_id IS NULL
    AND g.user_id IS NOT NULL
    AND g.posted_at IS NOT NULL
    AND g.pre_generation_storage_path IS NOT NULL
    AND g.show_before_image IS TRUE
    -- いまも企画のハッシュタグが付いている(タグを外した作品は出さない。企画ページの一覧と同じ)
    AND EXISTS (
      SELECT 1
      FROM public.post_hashtags ph
      JOIN public.hashtags h
        ON h.id = ph.hashtag_id
      WHERE ph.post_id = g.id
        AND h.name_normalized = c.hashtag_normalized
    )
    AND (
      NOT v_has_cursor
      OR (g.posted_at, g.id) < (p_cursor_posted_at, p_cursor_id)
    )
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
          AND pr.post_id = g.id
      )
    )
    AND v.is_available
  ORDER BY g.posted_at DESC, g.id DESC
  LIMIT p_limit;
END;
$function$;

COMMENT ON FUNCTION public.get_user_style_campaign_page(UUID, TEXT, INT, TIMESTAMPTZ, UUID) IS
  '/user-styles のハッシュタグ企画のタブの1ページ分を投稿本体ごと返す。掲載条件は get_user_style_page と同じ+応募作の記録にありタグが付いたまま。(posted_at,id)のkeyset。service_role のみ';

REVOKE ALL ON FUNCTION public.get_user_style_campaign_page(UUID, TEXT, INT, TIMESTAMPTZ, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_style_campaign_page(UUID, TEXT, INT, TIMESTAMPTZ, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_style_campaign_page(UUID, TEXT, INT, TIMESTAMPTZ, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_style_campaign_page(UUID, TEXT, INT, TIMESTAMPTZ, UUID) TO service_role;

COMMIT;

-- アプリは Data API 経由の rpc() で呼ぶため、スキーマキャッシュを読み直させる(20260918100000 と同じ)
NOTIFY pgrst, 'reload schema';

-- ===============================================
-- DOWN: DROP FUNCTION public.get_user_style_campaign_page(UUID, TEXT, INT, TIMESTAMPTZ, UUID);
--       この関数を呼ぶのは /user-styles の企画のタブだけなので、落としても他に影響しない。
-- ===============================================
