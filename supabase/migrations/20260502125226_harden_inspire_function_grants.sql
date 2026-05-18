-- ===============================================
-- Inspire RPC の grant をハードニング (anon EXECUTE を剥奪)
-- ===============================================
-- Supabase の public schema デフォルト権限により、新規 SECURITY DEFINER 関数は
-- 自動的に anon にも EXECUTE が付与される。これを明示的に剥奪し、
-- /supabase-postgres-best-practices security-privileges の最小権限原則に揃える。
--
-- 既存プロジェクトの apply_admin_moderation_decision 等は anon EXECUTE が残っているが、
-- それは別途のハードニング対象として、Phase 1 新規分のみ揃える。

-- admin の判断 RPC: anon 不可、authenticated は API 層 requireAdmin を経由
REVOKE EXECUTE ON FUNCTION public.apply_user_style_template_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM anon, PUBLIC;

-- draft 作成 / draft → pending 昇格 RPC: anon 不可
REVOKE EXECUTE ON FUNCTION public.create_user_style_template_draft(UUID, TEXT) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_user_style_template_draft(UUID, UUID, JSONB) FROM anon, PUBLIC;

-- enforce_user_style_template_submission_cap はトリガ関数。
-- PostgREST 経由で叩かれる必要は一切無いので、authenticated と anon の両方から剥奪。
REVOKE EXECUTE ON FUNCTION public.enforce_user_style_template_submission_cap() FROM anon, authenticated, PUBLIC;
