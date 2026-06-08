-- ===============================================
-- 進捗集計 RPC get_collection_progress + 集計用インデックス
-- ===============================================
-- アクティブなコレクションシリーズごとに、ログインユーザー(auth.uid())の
-- ユニーク衣装数 / N / 達成状態 / 台紙情報を返す。
-- ユニーク衣装数 = image_jobs の同一 category_key 内 oneTapStyle.id の DISTINCT 数
-- (status='succeeded' のみ)。設計判断は計画書 ADR-002 / ADR-006 を参照。
-- ===============================================

-- 集計を支える式インデックス(成功ジョブのみ・user×category×衣装id)
CREATE INDEX IF NOT EXISTS idx_image_jobs_collection_progress
  ON public.image_jobs (
    user_id,
    style_preset_category_key,
    ((generation_metadata -> 'oneTapStyle' ->> 'id'))
  )
  WHERE status = 'succeeded' AND style_preset_category_key IS NOT NULL;

-- 引数で user_id を受け取らず auth.uid() を使う(なりすまし防止)
CREATE OR REPLACE FUNCTION public.get_collection_progress()
RETURNS TABLE (
  category_id UUID,
  category_key TEXT,
  display_name_ja TEXT,
  display_name_en TEXT,
  completion_threshold INTEGER,
  unique_outfit_count INTEGER,
  is_completed BOOLEAN,
  mount_status TEXT,
  mount_image_path TEXT,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN; -- 未ログインは空(進捗はログイン前提)
  END IF;

  RETURN QUERY
  SELECT
    pc.id,
    pc.key,
    pc.display_name_ja,
    pc.display_name_en,
    pc.completion_threshold,
    COALESCE(cnt.unique_count, 0)::INTEGER,
    (cc.mount_status = 'completed') AS is_completed,
    cc.mount_status,
    cc.mount_image_path,
    cc.completed_at
  FROM public.preset_categories pc
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT ij.generation_metadata -> 'oneTapStyle' ->> 'id') AS unique_count
    FROM public.image_jobs ij
    WHERE ij.user_id = v_uid
      AND ij.style_preset_category_key = pc.key
      AND ij.status = 'succeeded'
      AND ij.generation_metadata -> 'oneTapStyle' ->> 'id' IS NOT NULL
  ) cnt ON true
  LEFT JOIN public.collection_completions cc
    ON cc.category_id = pc.id AND cc.user_id = v_uid
  WHERE pc.is_collection_series = true
  ORDER BY pc.display_order, pc.key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_collection_progress() TO authenticated;

COMMENT ON FUNCTION public.get_collection_progress() IS 'auth.uid() のアクティブなコレクションシリーズ進捗(ユニーク衣装数・N・達成状態・台紙)を返す';

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.get_collection_progress();
-- DROP INDEX IF EXISTS public.idx_image_jobs_collection_progress;
-- ===============================================
