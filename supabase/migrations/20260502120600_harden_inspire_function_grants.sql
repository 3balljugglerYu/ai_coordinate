-- ===============================================
-- Inspire RPC の grant をハードニング (anon EXECUTE を剥奪)
-- ===============================================
-- Supabase の public schema デフォルト権限により、新規 SECURITY DEFINER 関数は
-- 自動的に anon にも EXECUTE が付与される（既存プロジェクト全 RPC 共通の状態）。
-- /supabase-postgres-best-practices security-privileges の最小権限原則に揃えるため、
-- Phase 1 新規分の inspire RPC については anon を明示的に剥奪する。
--
-- 既存プロジェクトの apply_admin_moderation_decision 等は本マイグレでは触らない。
-- 別途のセキュリティハードニング PR で対応する。

-- admin の判断 RPC: anon 不可（authenticated は API 層 requireAdmin を経由）
REVOKE EXECUTE ON FUNCTION public.apply_user_style_template_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM anon, PUBLIC;

-- draft 作成 / draft → pending 昇格 RPC: anon 不可
REVOKE EXECUTE ON FUNCTION public.create_user_style_template_draft(UUID, TEXT) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_user_style_template_draft(UUID, UUID, JSONB) FROM anon, PUBLIC;

-- enforce_user_style_template_submission_cap はトリガ関数のため
-- PostgREST 経由で叩かれる必要は一切無い。authenticated と anon の両方から剥奪する。
REVOKE EXECUTE ON FUNCTION public.enforce_user_style_template_submission_cap() FROM anon, authenticated, PUBLIC;

-- ===============================================
-- DOWN:
-- GRANT EXECUTE ON FUNCTION public.apply_user_style_template_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO anon, PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.create_user_style_template_draft(UUID, TEXT) TO anon, PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.promote_user_style_template_draft(UUID, UUID, JSONB) TO anon, PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.enforce_user_style_template_submission_cap() TO anon, authenticated, PUBLIC;
-- ===============================================
