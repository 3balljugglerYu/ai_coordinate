-- ===============================================
-- Style Template Audit Logs
-- ===============================================
-- ADR-007 / ADR-012 参照
-- テンプレ単位の監査履歴。admin の承認/差戻し/非公開化を記録する。
-- moderation_audit_logs（投稿用）の別物として運用。
--
-- /supabase-postgres-best-practices 準拠:
--   - 全認証ユーザー SELECT 可は採用しない（差戻し理由の漏洩防止）
--   - SELECT は admin と当該テンプレの申請者のみ
--   - INSERT は SECURITY DEFINER の RPC のみが行う（authenticated には GRANT しない）

CREATE TABLE IF NOT EXISTS public.style_template_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.user_style_templates(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL
    CHECK (action IN ('submit', 'approve', 'reject', 'unpublish', 'withdraw')),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.style_template_audit_logs
  IS 'Inspire 機能: テンプレート単位の監査履歴（admin の承認/差戻し/非公開化と申請者の取り下げ）';
COMMENT ON COLUMN public.style_template_audit_logs.action
  IS 'submit=申請（draft→pending） / approve=承認 / reject=差戻し / unpublish=非公開化 / withdraw=申請者の取り下げ';

-- FK 索引: テンプレ単位の履歴 join
CREATE INDEX IF NOT EXISTS idx_style_template_audit_logs_template_created
  ON public.style_template_audit_logs (template_id, created_at DESC);

-- FK 索引: actor 単位の集計（admin ダッシュボード）
CREATE INDEX IF NOT EXISTS idx_style_template_audit_logs_actor_created
  ON public.style_template_audit_logs (actor_id, created_at DESC);

-- ===============================================
-- RLS
-- ===============================================

ALTER TABLE public.style_template_audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: admin は全件
DROP POLICY IF EXISTS "style_template_audit_logs_select_admin" ON public.style_template_audit_logs;
CREATE POLICY "style_template_audit_logs_select_admin"
  ON public.style_template_audit_logs
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

-- SELECT: 申請者は自分のテンプレ履歴のみ
DROP POLICY IF EXISTS "style_template_audit_logs_select_submitter" ON public.style_template_audit_logs;
CREATE POLICY "style_template_audit_logs_select_submitter"
  ON public.style_template_audit_logs
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_style_templates t
    WHERE t.id = template_id
      AND t.submitted_by_user_id = (SELECT auth.uid())
  ));

-- INSERT は SECURITY DEFINER の RPC のみが行うため、INSERT ポリシーは作らず
-- authenticated への GRANT INSERT もしない（デフォルト DENY）。
REVOKE INSERT, UPDATE, DELETE ON public.style_template_audit_logs FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.style_template_audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.style_template_audit_logs FROM anon;

-- ===============================================
-- DOWN:
-- DROP TABLE IF EXISTS public.style_template_audit_logs;
-- ===============================================
