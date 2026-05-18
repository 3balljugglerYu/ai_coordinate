-- ===============================================
-- apply_catalog_entry_decision RPC
-- ===============================================
-- admin の承認 / 差戻し / 非公開化を 1 トランザクションで適用する。
-- 既存 apply_user_style_template_decision (20260502120300) の構造を踏襲。
--
-- 注意: 本 RPC は admin チェックをしない。
--       呼出側 API ハンドラで requireAdmin() を必ず先行実行すること。

CREATE OR REPLACE FUNCTION public.apply_catalog_entry_decision(
  p_entry_id UUID,
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
  v_decided_at TIMESTAMPTZ;
BEGIN
  IF p_action NOT IN ('approve', 'reject', 'unpublish') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action
      USING ERRCODE = '22023';
  END IF;

  v_decided_at := COALESCE(p_decided_at, now());

  IF p_action = 'approve' THEN
    v_next_status := 'approved';
    v_next_reason := NULL;
    v_approved_at := v_decided_at;
  ELSE
    -- reject / unpublish
    v_next_status := 'rejected';
    v_next_reason := COALESCE(NULLIF(p_reason, ''), 'admin_' || p_action);
    v_approved_at := NULL;
  END IF;

  UPDATE public.catalog_entries
  SET
    status            = v_next_status,
    rejection_reason  = CASE
      WHEN p_action = 'approve' THEN NULL
      ELSE v_next_reason
    END,
    approved_at       = CASE
      WHEN p_action = 'approve' THEN v_approved_at
      ELSE approved_at  -- unpublish 時は元の承認時刻を維持
    END,
    decided_by        = p_actor_id
  WHERE id = p_entry_id
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.catalog_audit_logs (
    entry_id,
    actor_id,
    action,
    reason,
    metadata
  ) VALUES (
    p_entry_id,
    p_actor_id,
    p_action,
    CASE
      WHEN p_action = 'approve' THEN NULL
      ELSE COALESCE(NULLIF(p_reason, ''), 'admin_' || p_action)
    END,
    COALESCE(p_metadata, '{}'::JSONB)
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_catalog_entry_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_catalog_entry_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO authenticated;

COMMENT ON FUNCTION public.apply_catalog_entry_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) IS
  'admin の承認/差戻し/非公開化を atomic に適用する。呼出側で requireAdmin() を必ず先行実行すること。';

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.apply_catalog_entry_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB);
-- ===============================================
