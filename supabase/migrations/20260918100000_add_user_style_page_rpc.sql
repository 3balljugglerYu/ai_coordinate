-- ===============================================
-- User ORIGINAL (/user-styles): 一覧1ページを「1文」で返す
-- ===============================================
-- 計画書: docs/planning/user-original-styles-implementation-plan.md
--
-- ## なぜ RPC にするか
--
-- 読み取りを RPC に寄せるのは、docs/architecture/data.ja.md の
-- 「原子的・冪等な処理は SQL 関数」（＝書き込みの方針）が理由ではない。
-- **ページングの整合性**が理由である（ADR-002）。get_popular_prompt_page と同じ:
--
--   1. 取得後にアプリ側で絞ると、20件取って数件落とした時点で
--      hasMore が false になり、一覧に穴が空く。
--   2. ID だけ返して本体を別文で引くと、2文の間に投稿取消・モデレーション・
--      ブロック・通報が起きたときに除外が効かない。
--
-- したがって **射影・除外・並び・ページングをこの1文に閉じる**。
-- 呼び出し側は返ってきた post をそのまま使い、追加の SELECT を発行しない。
--
-- ## 判定を書き写さない
--
-- 「使えるか」の正本は validate_derived_prompt_source、
-- 「何回使われたか」の正本は get_prompt_usage_count。どちらも
-- **LATERAL で呼ぶだけ**にする（20260819120000 のバッチ版と同じ作法）。
--
-- ⭐ 利用数は絶対に generated_images から数え直さないこと。
--    「所有者が書き換えられるため採らない」と .cursor/rules/database-design.mdc の
--    prompt_usage_events の項が明記している。
--
-- ## requester に原作者自身を渡す理由
--
-- このページは未ログインでも開ける。validate_derived_prompt_source の
-- フォロー条件は「フォロー済み または 本人」、ブロックは双方向検査なので、
-- requester = 原作者にすると**閲覧者依存の条件だけが外れ**、内在的な可否
--（実在・投稿済み・visible・free・root・secret あり・作者が利用可）が残る。
-- フォロー有無はカード側（PostFeedCard の CTA）が解決する。
--
-- ⭐ その代わり、閲覧者依存の除外（双方向ブロック・本人の通報）はこの関数が
--    p_viewer_id で行う。**validate 側は通報を一切見ていない**（実測: 出現0回）。
--
-- ## ページングは offset ではなく keyset cursor
--
-- get_popular_prompt_page は OFFSET を使うが、あちらは順位が
-- popular_prompt_rankings に**事前計算で固定されている**から安全なのであって、
-- 同じ理屈はこの一覧には効かない。posted_at DESC 単独ではタイブレーカーが無く、
-- 同時刻の行で順序が不定になる（ページ境界で重複・欠落）。
--
-- ## volatility
--
-- validate_derived_prompt_source が VOLATILE なので、これも VOLATILE のままにする
--（20260819120000 の validate_derived_prompt_sources と同じ扱い）。実体は読み取りのみ。
--
-- ===============================================
-- ⭐⭐ 掲載条件（CANONICAL LISTING PREDICATE）⭐⭐
-- ===============================================
-- 以下の 7 条件は get_user_style_followed_authors にも**一字一句同じもの**が入る。
-- 片方だけ変えると「チップはあるのに押すと空」「一覧には出るのにチップに出ない」が
-- 静かに生まれる（PR #638 レビュー#3 で指摘された型）。
--
--   g.generation_type = 'free'
--   g.is_posted = true
--   g.moderation_status = 'visible'
--   g.source_post_id IS NULL
--   g.user_id IS NOT NULL
--   g.posted_at IS NOT NULL                        -- 並びを全順序にするため
--   g.pre_generation_storage_path IS NOT NULL      -- Before 必須（ADR-009）
--   g.show_before_image IS TRUE                    -- 〃（TS側 getPostBeforeImageUrl と同義）
--
-- 変えるときは両方の migration と tests/unit/features/user-styles/ を同時に直すこと。
-- ===============================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.get_user_style_page(
  p_viewer_id UUID,
  p_limit INT,
  p_sort TEXT,
  p_author_id UUID,
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
  -- 👑 に載る下限。TS 側 USAGE_COUNT_DISPLAY_MIN（features/posts/lib/constants.ts）と
  -- 揃えること。片方だけ変えると「数字が出ていないのに上位にいるカード」が生まれる。
  c_usage_min CONSTANT INT := 3;
  v_sort TEXT := COALESCE(p_sort, 'newest');
  v_has_cursor BOOLEAN := p_cursor_posted_at IS NOT NULL AND p_cursor_id IS NOT NULL;
BEGIN
  -- 呼び出し側の取り違えは黙って丸めず、ここで落とす。
  -- 丸めると「40件返ると思っていたのに20件」のような静かな不具合になる。
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 40 THEN
    RAISE EXCEPTION 'p_limit は 1..40 の範囲で指定すること (受け取った値: %)', p_limit;
  END IF;

  IF v_sort NOT IN ('newest', 'usage') THEN
    RAISE EXCEPTION 'p_sort は newest / usage のいずれか (受け取った値: %)', v_sort;
  END IF;

  -- cursor は両方揃っているか、両方無いかのみ。片方だけは取り違えなので落とす。
  IF (p_cursor_posted_at IS NULL) <> (p_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'cursor は posted_at と id を両方渡すこと';
  END IF;

  IF v_sort = 'usage' AND v_has_cursor THEN
    RAISE EXCEPTION 'usage 並びは1ページで返し切るため cursor を受け付けない';
  END IF;

  IF v_sort = 'usage' THEN
    /*
      👑 よく使われている。

      ⭐ **ページングしない。1回で返し切る。**
      利用回数はライブに動くので、cursor を足しても順序は固定できない
      （ページ境界で重複・欠落が出る）。実測 33 件・p_limit 上限 40 なので
      現状は1ページに収まる。

      ⭐ トリップワイヤ: 該当件数が 40 に近づいたら、この分岐は
      **事前計算スナップショット方式**（popular_prompt_rankings と同じ発想）へ
      移すこと。今のまま件数だけ増えると、上位40件から先が黙って消える。
    */
    RETURN QUERY
    SELECT to_jsonb(g) AS post, u.usage_count
    FROM public.generated_images g
    CROSS JOIN LATERAL public.validate_derived_prompt_source(g.id, g.user_id) AS v
    CROSS JOIN LATERAL (
      SELECT public.get_prompt_usage_count(g.id) AS usage_count
    ) AS u
    -- ⭐ CANONICAL LISTING PREDICATE（ファイル冒頭を参照）
    WHERE g.generation_type = 'free'
      AND g.is_posted = true
      AND g.moderation_status = 'visible'
      AND g.source_post_id IS NULL
      AND g.user_id IS NOT NULL
      AND g.posted_at IS NOT NULL
      AND g.pre_generation_storage_path IS NOT NULL
      AND g.show_before_image IS TRUE
      AND (p_author_id IS NULL OR g.user_id = p_author_id)
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
      AND u.usage_count >= c_usage_min
    ORDER BY u.usage_count DESC, g.posted_at DESC, g.id DESC
    LIMIT p_limit;
  ELSE
    /*
      すべて（既定）＝ 投稿の最新順。

      (posted_at, id) の全順序に対する keyset cursor。
      ⭐ posted_at DESC 単独にしないこと。同時刻の行で順序が不定になり、
      ページ境界で同じカードが重複したり抜けたりする。
    */
    RETURN QUERY
    SELECT to_jsonb(g) AS post, u.usage_count
    FROM public.generated_images g
    CROSS JOIN LATERAL public.validate_derived_prompt_source(g.id, g.user_id) AS v
    CROSS JOIN LATERAL (
      SELECT public.get_prompt_usage_count(g.id) AS usage_count
    ) AS u
    -- ⭐ CANONICAL LISTING PREDICATE（ファイル冒頭を参照）
    WHERE g.generation_type = 'free'
      AND g.is_posted = true
      AND g.moderation_status = 'visible'
      AND g.source_post_id IS NULL
      AND g.user_id IS NOT NULL
      AND g.posted_at IS NOT NULL
      AND g.pre_generation_storage_path IS NOT NULL
      AND g.show_before_image IS TRUE
      AND (p_author_id IS NULL OR g.user_id = p_author_id)
      AND (
        NOT v_has_cursor
        OR (g.posted_at, g.id) < (p_cursor_posted_at, p_cursor_id)
      )
      AND (
        p_viewer_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.user_blocks b
          WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = g.user_id)
             OR (b.blocked_id = p_viewer_id AND b.blocker_id = g.user_id)
        )
      )
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
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.get_user_style_page(UUID, INT, TEXT, UUID, TIMESTAMPTZ, UUID) IS
  '/user-styles の1ページ分を投稿本体ごと返す。除外・並び・ページング・射影を同一SQL文に閉じる。newestは(posted_at,id)のkeyset、usageは1ページで返し切る。service_role のみ';

REVOKE ALL ON FUNCTION public.get_user_style_page(UUID, INT, TEXT, UUID, TIMESTAMPTZ, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_style_page(UUID, INT, TEXT, UUID, TIMESTAMPTZ, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_style_page(UUID, INT, TEXT, UUID, TIMESTAMPTZ, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_style_page(UUID, INT, TEXT, UUID, TIMESTAMPTZ, UUID) TO service_role;

COMMIT;

-- ⭐ PostgREST のスキーマキャッシュを明示的に再読み込みさせる。
-- アプリは Data API 経由の rpc() で呼ぶため、キャッシュが古いと PGRST202
-- (function not found) になる。DDL の event trigger による自動 reload は
-- 即時とは限らず、20260730200100 の作業中に実際に PGRST202 を踏んでいる。
NOTIFY pgrst, 'reload schema';

-- ===============================================
-- DOWN: DROP FUNCTION public.get_user_style_page(UUID, INT, TEXT, UUID, TIMESTAMPTZ, UUID);
--       この関数を呼ぶのは /user-styles だけなので、落としても他に影響しない。
-- ===============================================
