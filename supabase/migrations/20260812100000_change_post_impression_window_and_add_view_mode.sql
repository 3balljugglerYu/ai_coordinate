-- インプレッションの重複除外を「1日1回」から「30分に1回」へ変更し、表示形式を記録する
--
-- ## なぜ変えるか
--
-- 直近14日・222投稿の分布が p10=15 / 中央値=24 / p90=29 と極端に潰れていた。
-- 上限がその日のアクティブ人数で決まるため、どの投稿もほぼ同じ数字になり、
-- 投稿者にとって「見られた」の手応えにならない。窓を縮めて数字を動かす。
--
-- 固定枠(floor(epoch/1800))にするのは、`ON CONFLICT DO NOTHING` の原子性を保つため。
-- 「前回から30分経過したか」で判定すると読み取り→条件付き書き込みになり、
-- 同時実行で二重加算しうる。10:29 と 10:31 が別枠になる粗さは許容する。
--
-- ## view_mode を足す理由
--
-- グリッド由来かフィード由来かを切り分けられないと、ホーム既定をフィードへ
-- 切り替える判断の材料が作れない(home_view_events は「タップ」しか見ていない)。
-- 既存行は切替前で判別不能なため NULL のままにする。grid/feed に割り振ると嘘になる。

-- 1) 30分枠の列。既存行は event_date の JST 0時に置く
--    (旧 UNIQUE が (image_id, viewer_key, event_date) だったので、
--     この詰め方なら新 UNIQUE も必ず満たす)
ALTER TABLE public.post_impressions
  ADD COLUMN window_start timestamptz;

UPDATE public.post_impressions
SET window_start = (event_date::timestamp AT TIME ZONE 'Asia/Tokyo')
WHERE window_start IS NULL;

ALTER TABLE public.post_impressions
  ALTER COLUMN window_start SET NOT NULL;

COMMENT ON COLUMN public.post_impressions.window_start IS
  '重複除外の30分固定枠の開始時刻(floor(epoch/1800)*1800)。切替前の行は event_date の JST 0時';

-- 2) 表示形式。切替前の行は判別不能なので NULL 許容
ALTER TABLE public.post_impressions
  ADD COLUMN view_mode text
  CHECK (view_mode IS NULL OR view_mode IN ('grid', 'feed', 'detail'));

COMMENT ON COLUMN public.post_impressions.view_mode IS
  'どこで見られたか。grid/feed=ホームの表示形式、detail=投稿詳細。NULL は切替前(2026-08-12以前)で判別不能';

-- 3) 重複除外を 日 → 30分枠 へ差し替え
ALTER TABLE public.post_impressions
  DROP CONSTRAINT post_impressions_dedup_unique;

ALTER TABLE public.post_impressions
  ADD CONSTRAINT post_impressions_dedup_unique
  UNIQUE (image_id, viewer_key, window_start);

-- 4) admin の期間集計用。既存の (image_id, event_date DESC) は投稿単位の索きで、
--    「期間で絞って日次に畳む」問い合わせには効かない
CREATE INDEX idx_post_impressions_created_at
  ON public.post_impressions (created_at DESC);

COMMENT ON TABLE public.post_impressions IS
  '投稿インプレッションの重複除外表(30分枠×視聴者×投稿)。viewer_key: 認証 u:<user_id> / ゲスト g:<ip_hash>。公開SELECT禁止(service role専用)';

COMMENT ON COLUMN public.generated_images.impression_count IS
  '公開閲覧数(viewableインプレッション)。可視50%×1秒で加算し、同一視聴者は30分に1回まで。view_count(詳細到達・重複除外なし)は内部分析用に併存';

-- 5) 記録RPC: 30分枠 + view_mode
--    p_view_mode は既定 NULL。マイグレーションを先に当ててもデプロイ前の
--    アプリ(2引数呼び出し)がそのまま動くようにするため。
--    引数の数が変わるため CREATE OR REPLACE では旧版が残る(オーバーロードになり、
--    2引数の呼び出しが旧版へ解決される)。必ず DROP してから作り直す。
DROP FUNCTION IF EXISTS public.record_post_impressions(uuid[], text);

CREATE FUNCTION public.record_post_impressions(
  p_image_ids uuid[],
  p_viewer_key text,
  p_view_mode text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_date date := timezone('Asia/Tokyo', now())::date;
  -- 30分の固定枠。クライアント側の抑止(前回送信から30分)より DB の方が緩いので、
  -- 二重計上にはならない(クライアントが送ってこない限り増えない)。
  v_window_start timestamptz := to_timestamp(floor(extract(epoch from now()) / 1800) * 1800);
  v_view_mode text := p_view_mode;
  v_inserted integer := 0;
BEGIN
  IF p_viewer_key IS NULL OR length(p_viewer_key) = 0 OR length(p_viewer_key) > 128 THEN
    RAISE EXCEPTION 'Invalid viewer key';
  END IF;
  IF p_image_ids IS NULL OR array_length(p_image_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;
  IF array_length(p_image_ids, 1) > 100 THEN
    RAISE EXCEPTION 'Too many image ids in one batch (max 100)';
  END IF;
  -- 想定外の値は落とさず NULL(不明)に倒す。表示形式は集計のための補助情報であり、
  -- ここで例外にすると計測そのものが止まってしまう
  IF v_view_mode IS NOT NULL AND v_view_mode NOT IN ('grid', 'feed', 'detail') THEN
    v_view_mode := NULL;
  END IF;

  WITH candidate AS (
    -- 公開中の投稿のみ対象(存在しないIDはここで消え、FK違反も起きない)
    SELECT gi.id AS image_id
    FROM public.generated_images gi
    WHERE gi.id = ANY (p_image_ids)
      AND gi.is_posted = true
      AND gi.moderation_status = 'visible'
  ),
  inserted AS (
    INSERT INTO public.post_impressions (
      image_id, viewer_key, event_date, window_start, view_mode
    )
    SELECT DISTINCT c.image_id, p_viewer_key, v_event_date, v_window_start, v_view_mode
    FROM candidate c
    ON CONFLICT (image_id, viewer_key, window_start) DO NOTHING
    RETURNING image_id
  ),
  bumped AS (
    UPDATE public.generated_images gi
    SET impression_count = gi.impression_count + 1
    FROM inserted i
    WHERE gi.id = i.image_id
    RETURNING gi.id
  )
  SELECT count(*) INTO v_inserted FROM bumped;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.record_post_impressions(uuid[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_post_impressions(uuid[], text, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_post_impressions(uuid[], text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_post_impressions(uuid[], text, text) TO service_role;

-- 6) admin ダッシュボード用の集計RPC
--    行をそのまま引くと 90日で数万件になり PostgREST の上限に当たるため、SQL 側で畳む。
--    期間のユニーク視聴者数は日次の合計ではないので、daily と totals を別々に出す。
CREATE OR REPLACE FUNCTION public.get_post_impression_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_top_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_top_limit, 20), 1), 100);
  v_daily jsonb;
  v_totals jsonb;
  v_top jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    RAISE EXCEPTION 'Invalid range';
  END IF;

  WITH scoped AS (
    SELECT event_date, viewer_key, image_id, view_mode
    FROM public.post_impressions
    WHERE created_at >= p_from
      AND created_at < p_to
  )
  SELECT
    coalesce(
      jsonb_agg(row_to_json(d)::jsonb ORDER BY d.date),
      '[]'::jsonb
    )
  INTO v_daily
  FROM (
    SELECT
      event_date::text AS date,
      count(*)::integer AS impressions,
      count(DISTINCT viewer_key)::integer AS unique_viewers,
      count(DISTINCT image_id)::integer AS unique_posts,
      count(*) FILTER (WHERE view_mode = 'grid')::integer AS grid,
      count(*) FILTER (WHERE view_mode = 'feed')::integer AS feed,
      count(*) FILTER (WHERE view_mode = 'detail')::integer AS detail,
      count(*) FILTER (WHERE view_mode IS NULL)::integer AS unknown,
      count(*) FILTER (WHERE viewer_key LIKE 'u:%')::integer AS authenticated,
      count(*) FILTER (WHERE viewer_key LIKE 'g:%')::integer AS guest
    FROM scoped
    GROUP BY event_date
  ) d;

  WITH scoped AS (
    SELECT viewer_key, image_id, view_mode
    FROM public.post_impressions
    WHERE created_at >= p_from
      AND created_at < p_to
  )
  SELECT jsonb_build_object(
    'impressions', count(*)::integer,
    'unique_viewers', count(DISTINCT viewer_key)::integer,
    'unique_posts', count(DISTINCT image_id)::integer,
    'grid', count(*) FILTER (WHERE view_mode = 'grid')::integer,
    'feed', count(*) FILTER (WHERE view_mode = 'feed')::integer,
    'detail', count(*) FILTER (WHERE view_mode = 'detail')::integer,
    'unknown', count(*) FILTER (WHERE view_mode IS NULL)::integer,
    'authenticated', count(*) FILTER (WHERE viewer_key LIKE 'u:%')::integer,
    'guest', count(*) FILTER (WHERE viewer_key LIKE 'g:%')::integer
  )
  INTO v_totals
  FROM scoped;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.impressions DESC), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT
      image_id::text AS image_id,
      count(*)::integer AS impressions,
      count(DISTINCT viewer_key)::integer AS unique_viewers
    FROM public.post_impressions
    WHERE created_at >= p_from
      AND created_at < p_to
    GROUP BY image_id
    ORDER BY count(*) DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object('daily', v_daily, 'totals', v_totals, 'topPosts', v_top);
END;
$$;

REVOKE ALL ON FUNCTION public.get_post_impression_stats(timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_post_impression_stats(timestamptz, timestamptz, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_post_impression_stats(timestamptz, timestamptz, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_post_impression_stats(timestamptz, timestamptz, integer) TO service_role;
