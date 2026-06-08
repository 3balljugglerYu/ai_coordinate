-- ===============================================
-- collection completion RPC の権限とリトライ制御を強化
-- ===============================================
-- - reserve は authenticated に公開するが、auth.uid() と public/active category のみで判定する
-- - finalize / fail は service_role route 専用にし、authenticated から直接 completed 化できないようにする
-- - failed 行は reserve 時に generating へ戻し、サーバー route から安全に再試行できるようにする
-- - progress は public/active なコレクションカテゴリだけを一般ユーザーに返す
-- - completion_threshold と mount_layout のスロット数不一致を DB 層でも拒否する
-- ===============================================

ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_collection_threshold_matches_layout;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_collection_threshold_matches_layout
  CHECK (
    completion_threshold IS NULL
    OR mount_layout IS NULL
    OR (
      (mount_layout = 'grid_3' AND completion_threshold = 3)
      OR (mount_layout = 'grid_4' AND completion_threshold = 4)
      OR (mount_layout = 'grid_6' AND completion_threshold = 6)
    )
  );

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
    WHERE ij.user_id = v_uid
      AND ij.style_preset_category_key = pc.key
      AND ij.status = 'succeeded'
      AND ij.generation_metadata -> 'oneTapStyle' ->> 'id' IS NOT NULL
  ) cnt ON true
  LEFT JOIN public.collection_completions cc
    ON cc.category_id = pc.id AND cc.user_id = v_uid
  WHERE pc.is_collection_series = true
    AND pc.visibility = 'public'
    AND pc.is_active = true
  ORDER BY pc.display_order, pc.key;
END;
$$;

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
    AND pc.visibility = 'public'
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

DROP FUNCTION IF EXISTS public.finalize_collection_completion(UUID, TEXT);
DROP FUNCTION IF EXISTS public.fail_collection_completion(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.finalize_collection_completion(
  p_completion_id UUID,
  p_user_id UUID,
  p_mount_image_path TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_mount_image_path IS NULL OR length(p_mount_image_path) = 0 THEN
    RAISE EXCEPTION 'mount_image_path_required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.collection_completions cc
  SET mount_status = 'completed',
      mount_image_path = p_mount_image_path,
      mount_error = NULL,
      completed_at = now()
  WHERE cc.id = p_completion_id
    AND cc.user_id = p_user_id
    AND cc.mount_status = 'generating'
    AND p_mount_image_path = ('collection-mounts/' || p_user_id::TEXT || '/' || cc.category_key || '/mount.png')
  RETURNING cc.id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_collection_completion(
  p_completion_id UUID,
  p_user_id UUID,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.collection_completions cc
  SET mount_status = 'failed',
      mount_error = left(coalesce(p_error, 'unknown error'), 500)
  WHERE cc.id = p_completion_id
    AND cc.user_id = p_user_id
    AND cc.mount_status = 'generating'
  RETURNING cc.id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_collection_completion(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_collection_completion(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_collection_completion(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_collection_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_collection_completion(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_collection_completion(UUID, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.reserve_collection_completion(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_collection_progress() TO authenticated;

COMMENT ON FUNCTION public.finalize_collection_completion(UUID, UUID, TEXT) IS
  'service_role route 専用。台紙 upload 後に collection_completions を completed 化する';
COMMENT ON FUNCTION public.fail_collection_completion(UUID, UUID, TEXT) IS
  'service_role route 専用。台紙生成失敗時に collection_completions を failed 化する';
