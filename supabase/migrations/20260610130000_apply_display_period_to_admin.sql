-- ===============================================
-- コレクション表示期間を admin にも適用
-- ===============================================
-- 20260610120000 では admin(p_include_admin_only=true) は表示期間外も
-- 進捗を閲覧できたが、「ユーザー視点での見え方」を確認できるよう、
-- 表示期間は admin にも適用する。admin の特例は visibility='admin_only'
-- シリーズのプレビューのみとする。
-- ===============================================

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
    AND (pc.collection_display_starts_at IS NULL OR now() >= pc.collection_display_starts_at)
    AND (pc.collection_display_ends_at IS NULL OR now() < pc.collection_display_ends_at)
  ORDER BY pc.display_order, pc.key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_collection_progress_for_user(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_collection_progress_for_user(UUID, BOOLEAN)
  TO service_role;

COMMENT ON FUNCTION public.get_collection_progress_for_user(UUID, BOOLEAN) IS
  'service_role route 専用。p_include_admin_only=true で admin_only シリーズも含めて進捗を返す(admin プレビュー用)。表示期間は admin にも適用される';

-- ===============================================
-- DOWN:
-- (20260610120000 の定義に戻す)
-- ===============================================
