-- ===============================================
-- collection mount の timestamp 付き保存パスを finalize RPC で許可する
-- ===============================================
-- OGP/SNS キャッシュ更新のため、台紙は
--   collection-mounts/{userId}/{categoryKey}/mount-{timestamp}.png
-- に保存する。既存の固定 mount.png も後方互換として許可する。

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
    AND (
      p_mount_image_path = ('collection-mounts/' || p_user_id::TEXT || '/' || cc.category_key || '/mount.png')
      OR p_mount_image_path ~ (
        '^collection-mounts/' || p_user_id::TEXT || '/' || cc.category_key || '/mount-[0-9]+\.png$'
      )
    )
  RETURNING cc.id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_collection_completion(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_collection_completion(UUID, UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.finalize_collection_completion(UUID, UUID, TEXT) IS
  'service_role route 専用。台紙 upload 後に collection_completions を completed 化する。mount.png と mount-{timestamp}.png を許可する';
