-- ===============================================
-- create_user_style_template_draft RPC
-- ===============================================
-- /api/style-templates/preview-generation から呼ぶ SECURITY DEFINER RPC。
-- draft 行を作成し、所有者をサーバ側で固定する（クライアントから user_id を受け取らない）。
--
-- このフェーズで draft を INSERT する唯一の経路。
-- 後続の Storage アップロード・プレビュー生成・URL 更新は API ハンドラ側で
-- 通常の UPDATE（service-role / 所有者）で行う。

CREATE OR REPLACE FUNCTION public.create_user_style_template_draft(
  p_actor_id UUID,
  p_alt TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'p_actor_id_required'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_style_templates (
    submitted_by_user_id,
    moderation_status,
    alt
  ) VALUES (
    p_actor_id,
    'draft',
    NULLIF(p_alt, '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_style_template_draft(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_style_template_draft(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_user_style_template_draft(UUID, TEXT)
  IS 'プレビュー API から呼ぶ draft 作成 RPC。所有者はサーバ側で p_actor_id に固定する。';

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.create_user_style_template_draft(UUID, TEXT);
-- ===============================================
