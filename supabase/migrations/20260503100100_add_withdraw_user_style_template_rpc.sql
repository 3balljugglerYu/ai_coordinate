-- ===============================================
-- withdraw_user_style_template RPC
-- ===============================================
-- レビュー指摘 #3 への対応。
-- 取り下げ操作（pending|visible → withdrawn の UPDATE と監査ログ INSERT）を
-- 1 トランザクションに統一する。draft の完全削除は API 側で行う（Storage 削除との
-- 整合性のため、API 層から直接 DELETE が必要）。
--
-- 許可される遷移:
--   pending  → withdrawn
--   visible  → withdrawn
-- それ以外（draft/removed/withdrawn）は呼び出し側で判定して別経路を使う。

CREATE OR REPLACE FUNCTION public.withdraw_user_style_template(
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
  -- 行ロック + 所有者検証
  SELECT id, submitted_by_user_id, moderation_status
  INTO v_template
  FROM public.user_style_templates
  WHERE id = p_template_id
    AND submitted_by_user_id = p_actor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_style_template_not_found_or_not_owner'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  IF v_template.moderation_status NOT IN ('pending', 'visible') THEN
    RAISE EXCEPTION 'user_style_template_cannot_withdraw_terminal_state: %', v_template.moderation_status
      USING ERRCODE = '22023',
            HINT = 'withdraw applies only to pending or visible templates';
  END IF;

  UPDATE public.user_style_templates
  SET
    moderation_status     = 'withdrawn',
    moderation_updated_at = v_now
  WHERE id = p_template_id;

  INSERT INTO public.style_template_audit_logs (
    template_id,
    actor_id,
    action,
    metadata
  ) VALUES (
    p_template_id,
    p_actor_id,
    'withdraw',
    COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object(
      'previous_status', v_template.moderation_status
    )
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_user_style_template(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_user_style_template(UUID, UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.withdraw_user_style_template(UUID, UUID, JSONB)
  IS '申請者本人が pending/visible テンプレを withdrawn に変更する atomic な RPC。状態遷移と監査ログを 1 トランザクションで実行する。draft の完全削除は別経路（API + Storage 削除）で行う。';

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.withdraw_user_style_template(UUID, UUID, JSONB);
-- ===============================================
