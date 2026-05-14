-- ===============================================
-- apply_user_style_template_decision RPC
-- ===============================================
-- ADR-007 参照
-- admin による承認/差戻し/非公開化を 1 トランザクションで実行する。
-- 既存お手本: 20260209094500_add_apply_admin_moderation_decision_rpc.sql を踏襲
--
-- 注意: 既存 apply_admin_moderation_decision と同様、本 RPC は admin チェックをしない。
--       呼出側 API ハンドラで requireAdmin() を必ず先行実行すること（Phase 2 のチェックリスト参照）。
--       認可は GRANT EXECUTE TO authenticated と組み合わせて API 層で防御する。

CREATE OR REPLACE FUNCTION public.apply_user_style_template_decision(
  p_template_id UUID,
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
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;

  v_decided_at := COALESCE(p_decided_at, now());

  IF p_action = 'approve' THEN
    v_next_status := 'visible';
    v_next_reason := NULL;
    v_approved_at := v_decided_at;
  ELSE
    -- reject / unpublish
    v_next_status := 'removed';
    v_next_reason := COALESCE(NULLIF(p_reason, ''), 'admin_' || p_action);
    v_approved_at := NULL;
  END IF;

  UPDATE public.user_style_templates
  SET
    moderation_status      = v_next_status,
    moderation_reason      = v_next_reason,
    moderation_updated_at  = v_decided_at,
    moderation_approved_at = CASE
      WHEN p_action = 'approve' THEN v_approved_at
      ELSE moderation_approved_at  -- 既存値を維持（unpublish 時に承認時刻を残す）
    END,
    moderation_decided_by  = p_actor_id
  WHERE id = p_template_id
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 監査ログ挿入
  INSERT INTO public.style_template_audit_logs (
    template_id,
    actor_id,
    action,
    reason,
    metadata
  ) VALUES (
    p_template_id,
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

REVOKE ALL ON FUNCTION public.apply_user_style_template_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_user_style_template_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO authenticated;

COMMENT ON FUNCTION public.apply_user_style_template_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  IS 'admin の承認/差戻し/非公開化を atomic に適用する。呼出側で requireAdmin() を必ず先行実行すること。';

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.apply_user_style_template_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB);
-- ===============================================
