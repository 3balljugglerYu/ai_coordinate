-- ===============================================
-- 台紙生成の予約 / 完了 / 失敗 RPC
-- ===============================================
-- collection_completions への書き込みは本 RPC(SECURITY DEFINER)に集約する。
-- いずれも auth.uid() を用い、他ユーザーの行を操作できない。
-- 設計判断は計画書 ADR-004 / ADR-006、要件 R-20〜R-25 を参照。
-- ===============================================

-- 予約: N到達をサーバー側で再検証し、generating の行を作る(冪等)
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
    AND pc.is_collection_series = true;

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

  -- 既存(生成中/完了/失敗)があれば、その行を返す(冪等)
  SELECT cc.id, cc.mount_status
    INTO v_id, v_status
  FROM public.collection_completions cc
  WHERE cc.user_id = v_uid AND cc.category_id = v_category_id;

  RETURN QUERY SELECT v_id, v_status, false;
END;
$$;

-- 完了: generating → completed。初回遷移のときだけ true を返す(イベント重複防止)
CREATE OR REPLACE FUNCTION public.finalize_collection_completion(
  p_completion_id UUID,
  p_mount_image_path TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  UPDATE public.collection_completions
  SET mount_status = 'completed',
      mount_image_path = p_mount_image_path,
      mount_error = NULL,
      completed_at = now()
  WHERE id = p_completion_id
    AND user_id = v_uid
    AND mount_status = 'generating'
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

-- 失敗: generating → failed(再試行可否はサーバー側で制御)
CREATE OR REPLACE FUNCTION public.fail_collection_completion(
  p_completion_id UUID,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  UPDATE public.collection_completions
  SET mount_status = 'failed',
      mount_error = p_error
  WHERE id = p_completion_id
    AND user_id = v_uid
    AND mount_status = 'generating'
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_collection_completion(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_collection_completion(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_collection_completion(UUID, TEXT) TO authenticated;

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.fail_collection_completion(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.finalize_collection_completion(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.reserve_collection_completion(TEXT);
-- ===============================================
