-- ===============================================
-- promote_user_style_template_draft RPC (draft → pending)
-- ===============================================
-- REQ-S-06 / REQ-S-07 / REQ-S-10 参照
-- 申請者が draft を pending に昇格させるときに呼ぶ SECURITY DEFINER RPC。
-- DB 層で以下を強制する:
--   - 行の所有者が呼出ユーザー本人であること
--   - 同意フラグ（copyright_consent_at）はサーバ側で now() を記録（クライアント値を信用しない）
--   - 状態遷移は draft → pending のみ
--   - cap (5 件) は trg_enforce_user_style_template_submission_cap が捕まえる
--   - audit log を 1 トランザクションで記録

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
  -- 行の取得（所有者検証込み）
  SELECT id, submitted_by_user_id, moderation_status, image_url, storage_path
  INTO v_template
  FROM public.user_style_templates
  WHERE id = p_template_id
    AND submitted_by_user_id = p_actor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_style_template_not_found_or_not_owner'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  IF v_template.moderation_status <> 'draft' THEN
    RAISE EXCEPTION 'user_style_template_not_in_draft'
      USING ERRCODE = '22023', HINT = 'Only draft rows can be promoted to pending.';
  END IF;

  -- 必要な画像が揃っているか（テンプレ画像本体は必須）
  IF v_template.image_url IS NULL OR v_template.storage_path IS NULL THEN
    RAISE EXCEPTION 'user_style_template_missing_image'
      USING ERRCODE = '22023', HINT = 'Template image must be uploaded before promotion.';
  END IF;

  -- draft → pending 昇格 + 同意タイムスタンプを now() で記録
  -- cap トリガがここで pending 件数を検査して check_violation を投げる可能性あり
  UPDATE public.user_style_templates
  SET
    moderation_status     = 'pending',
    moderation_updated_at = v_now,
    copyright_consent_at  = v_now
  WHERE id = p_template_id;

  -- 監査ログ
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

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.promote_user_style_template_draft(UUID, UUID, JSONB);
-- ===============================================
