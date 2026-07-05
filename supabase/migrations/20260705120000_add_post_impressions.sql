-- 公開「閲覧数」を viewable インプレッションへ変更(計画書: docs/planning/post-impressions-implementation-plan.md)
--
-- - generated_images.impression_count: 公開数値(フィードで軽く読める公開カウンタ列)。
--   既存 RLS(is_posted=true AND moderation_status='visible')で読むため列追加のみ。
-- - post_impressions: 重複除外(dedup)表。(image_id, viewer_key, event_date) UNIQUE で
--   「1日1回/視聴者/投稿」を担保(ADR-001/002)。将来の日次集計(adminチャート)も兼ねる。
-- - record_post_impressions RPC: バッチ原子実行(dedup INSERT → 新規分のみ加算)で
--   ホット行 UPDATE を緩和(ADR-001)。
-- - ベースライン補填(ADR-004): impression_count := view_count を初期1回実行。
--   ※go-live(フラグON)時に GREATEST(impression_count, view_count) で再ベースラインを
--     実行すること(適用〜公開の間の view_count 増加による見かけの減少を防ぐ)。

-- 1) 公開カウンタ列
ALTER TABLE public.generated_images
  ADD COLUMN impression_count integer NOT NULL DEFAULT 0 CHECK (impression_count >= 0);

COMMENT ON COLUMN public.generated_images.impression_count IS
  '公開閲覧数(viewableインプレッション)。フィード可視50%×1秒で加算。view_count(詳細到達)は内部分析用に併存';

-- 2) dedup表(公開SELECT禁止: RLS有効・ポリシー無し = service role/RPC のみ)
CREATE TABLE public.post_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.generated_images(id) ON DELETE CASCADE,
  viewer_key text NOT NULL,
  event_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_impressions_dedup_unique UNIQUE (image_id, viewer_key, event_date)
);

CREATE INDEX idx_post_impressions_image_date
  ON public.post_impressions (image_id, event_date DESC);

ALTER TABLE public.post_impressions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.post_impressions IS
  '投稿インプレッションの重複除外表(日次×視聴者×投稿)。viewer_key: 認証 u:<user_id> / ゲスト g:<ip_hash>。公開SELECT禁止(service role専用)';

-- 3) バッチ記録RPC: dedup INSERT ON CONFLICT DO NOTHING → 新規行の分だけ impression_count を加算
--    - p_image_ids は上限100(APIのZodと二重ガード)
--    - 存在しない/未投稿/非表示の image_id は無視(FK違反での全体失敗と、非公開投稿への計上を防ぐ)
--    - event_date は JST(ADR-001)
CREATE OR REPLACE FUNCTION public.record_post_impressions(
  p_image_ids uuid[],
  p_viewer_key text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_date date := timezone('Asia/Tokyo', now())::date;
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

  WITH candidate AS (
    -- 公開中の投稿のみ対象(存在しないIDはここで消え、FK違反も起きない)
    SELECT gi.id AS image_id
    FROM public.generated_images gi
    WHERE gi.id = ANY (p_image_ids)
      AND gi.is_posted = true
      AND gi.moderation_status = 'visible'
  ),
  inserted AS (
    INSERT INTO public.post_impressions (image_id, viewer_key, event_date)
    SELECT DISTINCT c.image_id, p_viewer_key, v_event_date
    FROM candidate c
    ON CONFLICT (image_id, viewer_key, event_date) DO NOTHING
    RETURNING image_id
  ),
  bumped AS (
    -- dedup を新規に通過した投稿のみ +1(1行/投稿/日/視聴者 なので常に+1)
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

-- service role 専用(クライアント直呼び不可。API route が viewer_key をサーバ側で解決して呼ぶ)
REVOKE ALL ON FUNCTION public.record_post_impressions(uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_post_impressions(uuid[], text) FROM anon;
REVOKE ALL ON FUNCTION public.record_post_impressions(uuid[], text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_post_impressions(uuid[], text) TO service_role;

-- 4) ベースライン補填(ADR-004): 既存の詳細到達数を下限として引き継ぐ(初期1回)
UPDATE public.generated_images
SET impression_count = view_count
WHERE view_count > 0;
