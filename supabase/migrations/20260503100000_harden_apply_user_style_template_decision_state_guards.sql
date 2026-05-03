-- ===============================================
-- apply_user_style_template_decision に状態遷移ガードを追加
-- ===============================================
-- レビュー指摘 #2 への対応。
-- 既存実装は現在の moderation_status を確認せずに UPDATE していたため、
-- draft → approve のような不正遷移が CHECK 制約（consent_required）まで
-- 進んで失敗していた。早期に分かりやすいエラーで弾くようガードを追加する。
--
-- 許可される遷移:
--   approve   : pending → visible
--   reject    : pending → removed
--   unpublish : visible → removed

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
  v_current_status TEXT;
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

  -- 状態遷移ガード: 現在の status を取得し、許可された遷移のみを通す
  SELECT moderation_status INTO v_current_status
  FROM public.user_style_templates
  WHERE id = p_template_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_action = 'approve' AND v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'user_style_template_invalid_transition: approve requires pending, got %', v_current_status
      USING ERRCODE = '22023', HINT = 'approve can be applied only to pending templates';
  END IF;
  IF p_action = 'reject' AND v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'user_style_template_invalid_transition: reject requires pending, got %', v_current_status
      USING ERRCODE = '22023', HINT = 'reject can be applied only to pending templates';
  END IF;
  IF p_action = 'unpublish' AND v_current_status <> 'visible' THEN
    RAISE EXCEPTION 'user_style_template_invalid_transition: unpublish requires visible, got %', v_current_status
      USING ERRCODE = '22023', HINT = 'unpublish can be applied only to visible templates';
  END IF;

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

-- 既存の grant を再宣言（CREATE OR REPLACE では grant が消えないが、明示しておく）
REVOKE ALL ON FUNCTION public.apply_user_style_template_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_user_style_template_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO authenticated;

COMMENT ON FUNCTION public.apply_user_style_template_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  IS 'admin の承認/差戻し/非公開化を atomic に適用する。状態遷移ガード付き（approve: pending→visible / reject: pending→removed / unpublish: visible→removed）。呼出側で requireAdmin() を必ず先行実行すること。';

-- ===============================================
-- DOWN:
-- 旧版（状態遷移ガード無し）の関数定義に CREATE OR REPLACE で戻す
-- ※ DOWN として再実行可能な形で残す場合は 20260502120300 の関数本体を再投入する。
-- ===============================================
