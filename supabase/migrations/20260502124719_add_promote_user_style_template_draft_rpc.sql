-- ===============================================
-- promote_user_style_template_draft RPC (draft → pending)
-- ===============================================

CREATE OR REPLACE FUNCTION public.promote_user_style_template_draft(
  p_template_id UUID,
  p_actor_id UUID,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT id, submitted_by_user_id, moderation_status, image_url, storage_path
  INTO v_template
  FROM public.user_style_templates
  WHERE id = p_template_id
    AND submitted_by_user_id = p_actor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_style_template_not_found_or_not_owner'
      USING ERRCODE = '42501';
  END IF;

  IF v_template.moderation_status <> 'draft' THEN
    RAISE EXCEPTION 'user_style_template_not_in_draft'
      USING ERRCODE = '22023', HINT = 'Only draft rows can be promoted to pending.';
  END IF;

  IF v_template.image_url IS NULL OR v_template.storage_path IS NULL THEN
    RAISE EXCEPTION 'user_style_template_missing_image'
      USING ERRCODE = '22023', HINT = 'Template image must be uploaded before promotion.';
  END IF;

  UPDATE public.user_style_templates
  SET
    moderation_status     = 'pending',
    moderation_updated_at = v_now,
    copyright_consent_at  = v_now
  WHERE id = p_template_id;

  INSERT INTO public.style_template_audit_logs (
    template_id,
    actor_id,
    action,
    metadata
  ) VALUES (
    p_template_id,
    p_actor_id,
    'submit',
    COALESCE(p_metadata, '{}'::JSONB)
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_user_style_template_draft(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_user_style_template_draft(UUID, UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.promote_user_style_template_draft(UUID, UUID, JSONB)
  IS 'draft 状態の user_style_templates を pending に昇格させ、同意タイムスタンプを記録する。';
