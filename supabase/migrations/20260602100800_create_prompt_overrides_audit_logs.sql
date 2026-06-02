-- ===============================================
-- prompt_overrides_audit_logs: prompt_overrides 操作の監査ログ
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-010
--
-- meta-prompt テンプレート (creator_looks.*) は Persta の moat であり、
-- admin による閲覧 / 更新を監査する必要がある。
-- このテーブルはアプリ層 (/admin/generation-prompts) から prompt_overrides の
-- creator_looks.% 行に対して SELECT / UPDATE が起きるたびに INSERT する。
--
-- 注意: metadata には hidden_prompt や prompt 本文を含めない (ADR-009 redactSecrets)。

BEGIN;

CREATE TABLE IF NOT EXISTS public.prompt_overrides_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('select', 'update', 'delete')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.prompt_overrides_audit_logs IS
  'prompt_overrides の閲覧 / 更新監査ログ。Creator Looks 関連 prompt (creator_looks.%) の追跡が主目的';
COMMENT ON COLUMN public.prompt_overrides_audit_logs.prompt_key IS
  '対象 prompt_overrides.prompt_key (例: creator_looks.meta_extractor)';
COMMENT ON COLUMN public.prompt_overrides_audit_logs.actor_id IS
  '操作した admin の auth.users.id';
COMMENT ON COLUMN public.prompt_overrides_audit_logs.action IS
  'select / update / delete';
COMMENT ON COLUMN public.prompt_overrides_audit_logs.metadata IS
  '操作詳細 (= IP / User-Agent 等)。hidden_prompt や prompt 本文は絶対に含めない';

-- インデックス: prompt_key 検索 + actor 検索 + 時系列
CREATE INDEX IF NOT EXISTS idx_prompt_overrides_audit_logs_prompt_key_created
  ON public.prompt_overrides_audit_logs (prompt_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prompt_overrides_audit_logs_actor_created
  ON public.prompt_overrides_audit_logs (actor_id, created_at DESC);

-- RLS: 通常ユーザー全 deny、admin のみ SELECT 可
ALTER TABLE public.prompt_overrides_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.prompt_overrides_audit_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.prompt_overrides_audit_logs FROM anon;
REVOKE ALL ON TABLE public.prompt_overrides_audit_logs FROM authenticated;

-- authenticated には SELECT のみ付与 (RLS で admin 絞り込み)
GRANT SELECT ON TABLE public.prompt_overrides_audit_logs TO authenticated;

DROP POLICY IF EXISTS "prompt_overrides_audit_logs_admin_select" ON public.prompt_overrides_audit_logs;
CREATE POLICY "prompt_overrides_audit_logs_admin_select"
  ON public.prompt_overrides_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- INSERT は SECURITY DEFINER RPC 経由のみ (= 直接 INSERT は不可)
-- 後続フェーズでアプリ層から呼ぶ。

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP POLICY IF EXISTS "prompt_overrides_audit_logs_admin_select" ON public.prompt_overrides_audit_logs;
-- DROP INDEX IF EXISTS idx_prompt_overrides_audit_logs_actor_created;
-- DROP INDEX IF EXISTS idx_prompt_overrides_audit_logs_prompt_key_created;
-- DROP TABLE IF EXISTS public.prompt_overrides_audit_logs;
-- COMMIT;
-- ===============================================
