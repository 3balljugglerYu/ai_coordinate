-- ===============================================
-- Admin moderation decision atomic RPC
-- ===============================================

CREATE OR REPLACE FUNCTION public.apply_admin_moderation_decision(
  p_post_id UUID,
  p_actor_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL,
  p_decided_at TIMESTAMPTZ DEFAULT now(),
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id UUID;
  v_next_status TEXT;
  v_next_reason TEXT;
  v_approved_at TIMESTAMPTZ;
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  IF p_action = 'approve' THEN
    v_next_status := 'visible';
    v_next_reason := NULL;
    v_approved_at := COALESCE(p_decided_at, now());
  ELSE
    v_next_status := 'removed';
    v_next_reason := COALESCE(NULLIF(p_reason, ''), 'admin_reject');
    v_approved_at := NULL;
  END IF;

  UPDATE public.generated_images
  SET
    moderation_status = v_next_status,
    moderation_reason = v_next_reason,
    moderation_updated_at = COALESCE(p_decided_at, now()),
    moderation_approved_at = v_approved_at
  WHERE id = p_post_id
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
    p_action,
    CASE
      WHEN p_action = 'approve' THEN NULL
      ELSE COALESCE(NULLIF(p_reason, ''), 'admin_reject')
    END,
    COALESCE(p_metadata, '{}'::JSONB)
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_admin_moderation_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_admin_moderation_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO authenticated;
