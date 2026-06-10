-- ===============================================
-- admin による admin_only コレクションシリーズのプレビュー対応
-- ===============================================
-- 本番公開(visibility='public')前に、admin が admin_only のシリーズで
-- 進捗・台紙生成を確認できるようにする。
--
-- 重要: admin 判定は env(ADMIN_USER_IDS)ベースで DB に存在しないため、
-- 「admin_only を含めるか」の判定は server route 側で行い、その指示は
-- service_role 専用 RPC 経由でのみ渡せるようにする(authenticated/anon からは不可)。
-- これにより一般ユーザーへ admin_only シリーズが漏れない状態を維持する。
-- ===============================================

-- 進捗(ユーザー指定 + admin_only 包含可)。service_role 専用。
CREATE OR REPLACE FUNCTION public.get_collection_progress_for_user(
  p_user_id UUID,
  p_include_admin_only BOOLEAN
)
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
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
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
    WHERE ij.user_id = p_user_id
      AND ij.style_preset_category_key = pc.key
      AND ij.status = 'succeeded'
      AND ij.generation_metadata -> 'oneTapStyle' ->> 'id' IS NOT NULL
  ) cnt ON true
  LEFT JOIN public.collection_completions cc
    ON cc.category_id = pc.id AND cc.user_id = p_user_id
  WHERE pc.is_collection_series = true
    AND pc.is_active = true
    AND (pc.visibility = 'public' OR p_include_admin_only = true)
  ORDER BY pc.display_order, pc.key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_collection_progress_for_user(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_collection_progress_for_user(UUID, BOOLEAN)
  TO service_role;

COMMENT ON FUNCTION public.get_collection_progress_for_user(UUID, BOOLEAN) IS
  'service_role route 専用。p_include_admin_only=true で admin_only シリーズも含めて進捗を返す(admin プレビュー用)';

-- reserve から visibility='public' 縛りを外す。
-- 公開可否(public または admin)の判定は server route 側で行う。
-- 非 admin が admin_only を直接 reserve しても、その衣装は生成できず閾値未達のため
-- threshold_not_reached で弾かれる(完了行は作られない)。
CREATE OR REPLACE FUNCTION public.reserve_collection_completion(p_category_key TEXT)
RETURNS TABLE (
  completion_id UUID,
  mount_status TEXT,
  newly_reserved BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_category_id UUID;
  v_threshold INTEGER;
  v_count INTEGER;
  v_id UUID;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pc.id, pc.completion_threshold
    INTO v_category_id, v_threshold
  FROM public.preset_categories pc
  WHERE pc.key = p_category_key
    AND pc.is_collection_series = true
    AND pc.is_active = true;

  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'collection_series_not_found: %', p_category_key USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(DISTINCT ij.generation_metadata -> 'oneTapStyle' ->> 'id')
    INTO v_count
  FROM public.image_jobs ij
  WHERE ij.user_id = v_uid
    AND ij.style_preset_category_key = p_category_key
    AND ij.status = 'succeeded'
    AND ij.generation_metadata -> 'oneTapStyle' ->> 'id' IS NOT NULL;

  IF v_count < v_threshold THEN
    RAISE EXCEPTION 'threshold_not_reached: % of %', v_count, v_threshold USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.collection_completions
    (user_id, category_id, category_key, threshold_at_completion, mount_status)
  VALUES
    (v_uid, v_category_id, p_category_key, v_threshold, 'generating')
  ON CONFLICT (user_id, category_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, 'generating'::TEXT, true;
    RETURN;
  END IF;

  SELECT cc.id, cc.mount_status
    INTO v_id, v_status
  FROM public.collection_completions cc
  WHERE cc.user_id = v_uid AND cc.category_id = v_category_id;

  IF v_status = 'failed' THEN
    UPDATE public.collection_completions cc
    SET mount_status = 'generating',
        mount_error = NULL,
        mount_image_path = NULL,
        completed_at = NULL
    WHERE cc.id = v_id
      AND cc.user_id = v_uid
      AND cc.mount_status = 'failed'
    RETURNING cc.id, cc.mount_status INTO v_id, v_status;

    RETURN QUERY SELECT v_id, v_status, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_id, v_status, false;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_collection_completion(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_collection_completion(TEXT) TO authenticated;

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.get_collection_progress_for_user(UUID, BOOLEAN);
-- (reserve は前マイグレーションの visibility='public' 付き定義に戻す)
-- ===============================================
