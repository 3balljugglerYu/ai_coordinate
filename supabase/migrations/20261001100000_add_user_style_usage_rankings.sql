-- ===============================================
-- User ORIGINAL (/user-styles) 👑「よく使われる」: 順位の事前計算とページング
-- ===============================================
-- 背景:
--   get_user_style_page の usage 分岐は「利用回数 3 回以上を 1 ページ(上限 40)で返し切る」
--   設計で、該当が 40 件に近づいたら事前計算スナップショット方式へ移すこと、という
--   トリップワイヤがコメントに残っていた(20260918100000)。
--   2026-10-01 時点で該当は 40 件以上あり(上限 40 で取ると 40 件ぎっしり返る)、
--   しかも画面は 20 件しか取りに行っていなかったため、上位 20 件より先が黙って消えていた。
--
-- 方針(🔥人気のプロンプト popular_prompt_rankings と同じ発想。2026-10-01 ユーザー決定):
--   1. 順位を pg_cron で毎時確定させ、user_style_usage_rankings に置く
--   2. 一覧は position の keyset cursor で 20 件ずつ読む(順位が固定されているので
--      ページ境界で重複・欠落しない)
--   3. 読み出しのたびに全候補の利用回数を数え直さなくて済むので、
--      公開後に全員(未ログイン・クローラー含む)が開いても重くならない
--
-- 判定は書き写さない(20260918100000 と同じ):
--   「使えるか」の正本は validate_derived_prompt_source、
--   「何回使われたか」の正本は get_prompt_usage_count。どちらも LATERAL で呼ぶだけ。
--   掲載条件(CANONICAL LISTING PREDICATE)は 20260918100000 冒頭の 7 条件と一字一句同じ。
--   読み出し時にも同じ条件を**もう一度**掛ける(確定から最大 1 時間の間に起きた
--   投稿取消・モデレーション・Before 非表示・作者の利用停止を即座に反映するため)。
--
-- 閲覧者依存の除外(双方向ブロック・本人の通報)は確定時ではなく読み出し時に掛ける
-- (確定は閲覧者に依らない 1 つの順位にするため)。
--
-- 鮮度: 確定から 3 時間を超えたら(cron が止まった等)、読み出し側は従来の
-- ライブ集計(get_user_style_page の usage 分岐、1 ページのみ)へフォールバックする。
-- 🔥人気のプロンプトの閾値(3 時間)と同じ。
-- ===============================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ===============================================
-- 1. 順位テーブル
-- ===============================================
CREATE TABLE IF NOT EXISTS public.user_style_usage_rankings (
  post_id UUID PRIMARY KEY,
  -- 表示の唯一の順序。keyset cursor の値にもなる。
  position INTEGER NOT NULL CHECK (position >= 1),
  -- 確定時点の利用回数(並びの根拠を後から追うため)。表示はライブの値を使う。
  usage_count INTEGER NOT NULL CHECK (usage_count >= 0),
  -- 鮮度判定。cron が止まったら読み出し側がライブ集計にフォールバックする。
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_style_usage_rankings_position_key UNIQUE (position)
);

COMMENT ON TABLE public.user_style_usage_rankings IS
  '/user-styles 👑よく使われる の確定順位。recompute_user_style_usage_rankings() が毎時洗い替える派生データ。service_role のみアクセス可';
COMMENT ON COLUMN public.user_style_usage_rankings.usage_count IS
  '確定時点の利用回数(get_prompt_usage_count)。表示はライブの値を使う';
COMMENT ON COLUMN public.user_style_usage_rankings.computed_at IS
  '算出時刻。読み出し側はこれが 3 時間より古いときライブ集計にフォールバックする';

-- 段階公開中の機能の中身が PostgREST 経由で読めないよう、全操作を拒否する
-- (popular_prompt_rankings と同じ)。読み書きは SECURITY DEFINER の関数からのみ。
ALTER TABLE public.user_style_usage_rankings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_style_usage_rankings FROM PUBLIC;
REVOKE ALL ON TABLE public.user_style_usage_rankings FROM anon;
REVOKE ALL ON TABLE public.user_style_usage_rankings FROM authenticated;

DROP POLICY IF EXISTS "user_style_usage_rankings_no_public_access"
  ON public.user_style_usage_rankings;
CREATE POLICY "user_style_usage_rankings_no_public_access"
  ON public.user_style_usage_rankings
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ===============================================
-- 2. 順位の確定(pg_cron から毎時)
-- ===============================================
CREATE OR REPLACE FUNCTION public.recompute_user_style_usage_rankings()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  -- 👑 に載る下限。get_user_style_page の c_usage_min と
  -- TS 側 USAGE_COUNT_DISPLAY_MIN(features/posts/lib/constants.ts)と揃えること。
  c_usage_min CONSTANT INT := 3;
  v_total INTEGER;
BEGIN
  -- ⭐ auth.uid() では未ログインを弾けない。service_role / pg_cron(postgres)かどうかは
  --    is_trusted_lineage_writer() に寄せる(recompute_popular_prompts と同じ)。
  IF NOT public.is_trusted_lineage_writer() THEN
    RAISE EXCEPTION 'recompute_user_style_usage_rankings: 許可されていない経路からの呼び出しです'
      USING ERRCODE = '42501';
  END IF;

  -- 全件洗い替え。対象は派生データの表だけで、関数の中(同一トランザクション)で
  -- 消して入れ直すので、読み出し側が空の表を見る瞬間は無い。
  DELETE FROM public.user_style_usage_rankings WHERE true;

  INSERT INTO public.user_style_usage_rankings (post_id, position, usage_count, computed_at)
  SELECT
    ranked.id,
    ranked.rn,
    ranked.usage_count,
    now()
  FROM (
    SELECT
      g.id,
      u.usage_count,
      row_number() OVER (
        ORDER BY u.usage_count DESC, g.posted_at DESC, g.id DESC
      )::INTEGER AS rn
    FROM public.generated_images g
    -- requester = 原作者自身: 閲覧者依存の条件(フォロー・ブロック)を外し、
    -- 内在的な可否だけを見る(20260918100000 冒頭の説明と同じ)
    CROSS JOIN LATERAL public.validate_derived_prompt_source(g.id, g.user_id) AS v
    CROSS JOIN LATERAL (
      SELECT public.get_prompt_usage_count(g.id) AS usage_count
    ) AS u
    -- ⭐ CANONICAL LISTING PREDICATE(20260918100000 冒頭を参照)
    WHERE g.generation_type = 'free'
      AND g.is_posted = true
      AND g.moderation_status = 'visible'
      AND g.source_post_id IS NULL
      AND g.user_id IS NOT NULL
      AND g.posted_at IS NOT NULL
      AND g.pre_generation_storage_path IS NOT NULL
      AND g.show_before_image IS TRUE
      AND v.is_available
      AND u.usage_count >= c_usage_min
  ) AS ranked;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$function$;

COMMENT ON FUNCTION public.recompute_user_style_usage_rankings() IS
  '/user-styles 👑よく使われる の順位を全件洗い替える。pg_cron から毎時。戻り値は確定した件数';

REVOKE ALL ON FUNCTION public.recompute_user_style_usage_rankings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_user_style_usage_rankings() FROM anon;
REVOKE ALL ON FUNCTION public.recompute_user_style_usage_rankings() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_user_style_usage_rankings() TO service_role;

-- ===============================================
-- 3. 1 ページ分の読み出し
-- ===============================================
CREATE OR REPLACE FUNCTION public.get_user_style_usage_page(
  p_viewer_id UUID,
  p_limit INT,
  p_cursor_position INT
)
RETURNS TABLE (
  post JSONB,
  usage_count INT,
  rank_position INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  c_stale CONSTANT INTERVAL := interval '3 hours';
  v_computed_at TIMESTAMPTZ;
BEGIN
  -- 呼び出し側の取り違えは黙って丸めず、ここで落とす(get_user_style_page と同じ)。
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 40 THEN
    RAISE EXCEPTION 'p_limit は 1..40 の範囲で指定すること (受け取った値: %)', p_limit;
  END IF;

  IF p_cursor_position IS NOT NULL AND p_cursor_position < 1 THEN
    RAISE EXCEPTION 'p_cursor_position は 1 以上 (受け取った値: %)', p_cursor_position;
  END IF;

  SELECT max(r.computed_at) INTO v_computed_at
  FROM public.user_style_usage_rankings r;

  IF v_computed_at IS NULL OR v_computed_at < now() - c_stale THEN
    /*
      順位が無い・古い(cron が止まった等)。従来のライブ集計へ倒す。
      ライブ集計は順序が固定できないので 1 ページだけ返し、続きは返さない
      (2 ページ目以降の要求には空を返す ── 重複・欠落を出すより安全)。
    */
    IF p_cursor_position IS NOT NULL THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT live.post, live.usage_count, live.ord::INT
    FROM public.get_user_style_page(p_viewer_id, p_limit, 'usage', NULL, NULL, NULL)
      WITH ORDINALITY AS live(post, usage_count, ord)
    ORDER BY live.ord;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT to_jsonb(g) AS post, u.usage_count, r.position AS rank_position
  FROM public.user_style_usage_rankings r
  JOIN public.generated_images g ON g.id = r.post_id
  CROSS JOIN LATERAL public.validate_derived_prompt_source(g.id, g.user_id) AS v
  CROSS JOIN LATERAL (
    SELECT public.get_prompt_usage_count(g.id) AS usage_count
  ) AS u
  WHERE (p_cursor_position IS NULL OR r.position > p_cursor_position)
    -- ⭐ CANONICAL LISTING PREDICATE をもう一度(確定後の取消・モデレーション等を即反映)
    AND g.generation_type = 'free'
    AND g.is_posted = true
    AND g.moderation_status = 'visible'
    AND g.source_post_id IS NULL
    AND g.user_id IS NOT NULL
    AND g.posted_at IS NOT NULL
    AND g.pre_generation_storage_path IS NOT NULL
    AND g.show_before_image IS TRUE
    AND v.is_available
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
  ORDER BY r.position
  LIMIT p_limit;
END;
$function$;

COMMENT ON FUNCTION public.get_user_style_usage_page(UUID, INT, INT) IS
  '/user-styles 👑よく使われる の1ページ分を投稿本体ごと返す。確定順位(user_style_usage_rankings)の position で keyset ページング。順位が3時間より古ければライブ集計の1ページに倒す。service_role のみ';

REVOKE ALL ON FUNCTION public.get_user_style_usage_page(UUID, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_style_usage_page(UUID, INT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_style_usage_page(UUID, INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_style_usage_page(UUID, INT, INT) TO service_role;

COMMIT;

-- ⭐ PostgREST のスキーマキャッシュを明示的に再読み込みさせる(PGRST202 対策。
-- 20260918100000 と同じ)。
NOTIFY pgrst, 'reload schema';

-- ===============================================
-- DOWN:
--   DROP FUNCTION public.get_user_style_usage_page(UUID, INT, INT);
--   DROP FUNCTION public.recompute_user_style_usage_rankings();
--   DROP TABLE public.user_style_usage_rankings;
--   (cron は 20261001100100 の DOWN を先に流すこと)
--   アプリは get_user_style_usage_page が無いと 👑 の一覧が空になる。戻すならアプリを先に戻す。
-- ===============================================
