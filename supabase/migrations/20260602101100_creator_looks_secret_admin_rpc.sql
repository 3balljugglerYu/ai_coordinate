-- ===============================================
-- get_creator_looks_secret_for_admin RPC
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-008
--
-- admin が hidden_prompt を確認するための SECURITY DEFINER RPC。
-- 関数内で必ず admin role を確認する (= service_role 同等の権限を一般ユーザーには渡さない)。

BEGIN;

CREATE OR REPLACE FUNCTION public.get_creator_looks_secret_for_admin(p_template_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hidden_prompt TEXT;
BEGIN
  -- admin role 必須 (= 通常 user の呼び出しを reject)
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'not_authorized'
      USING ERRCODE = '42501';
  END IF;

  -- 該当 secret を取得
  SELECT hidden_prompt INTO v_hidden_prompt
  FROM public.user_style_template_secrets
  WHERE template_id = p_template_id;

  RETURN v_hidden_prompt;
END;
$$;

COMMENT ON FUNCTION public.get_creator_looks_secret_for_admin(UUID) IS
  'admin が hidden_prompt を取得するための SECURITY DEFINER RPC。内部で admin_users 所属を必ず確認する';

REVOKE ALL ON FUNCTION public.get_creator_looks_secret_for_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_looks_secret_for_admin(UUID) TO authenticated;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.get_creator_looks_secret_for_admin(UUID);
-- COMMIT;
-- ===============================================
