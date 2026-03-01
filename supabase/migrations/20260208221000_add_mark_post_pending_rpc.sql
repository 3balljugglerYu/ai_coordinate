-- ===============================================
-- Auto moderation pending fallback RPC
-- ===============================================

CREATE OR REPLACE FUNCTION public.mark_post_pending_by_report(
  p_post_id UUID,
  p_actor_id UUID,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id UUID;
BEGIN
  UPDATE public.generated_images
  SET
    moderation_status = 'pending',
    moderation_reason = COALESCE(NULLIF(p_reason, ''), 'report_threshold'),
    moderation_updated_at = now()
  WHERE id = p_post_id
    AND is_posted = true
    AND moderation_status = 'visible'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.moderation_audit_logs (
    post_id,
    actor_id,
    action,
    reason,
    metadata
  ) VALUES (
    p_post_id,
    p_actor_id,
    'pending_auto',
    COALESCE(NULLIF(p_reason, ''), 'report_threshold'),
    COALESCE(p_metadata, '{}'::JSONB)
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_post_pending_by_report(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_post_pending_by_report(UUID, UUID, TEXT, JSONB) TO authenticated;
