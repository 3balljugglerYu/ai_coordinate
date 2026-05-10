-- ===============================================
-- Style Template Audit Logs
-- ===============================================

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

CREATE INDEX IF NOT EXISTS idx_style_template_audit_logs_template_created
  ON public.style_template_audit_logs (template_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_style_template_audit_logs_actor_created
  ON public.style_template_audit_logs (actor_id, created_at DESC);

ALTER TABLE public.style_template_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "style_template_audit_logs_select_admin" ON public.style_template_audit_logs;
CREATE POLICY "style_template_audit_logs_select_admin"
  ON public.style_template_audit_logs
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "style_template_audit_logs_select_submitter" ON public.style_template_audit_logs;
CREATE POLICY "style_template_audit_logs_select_submitter"
  ON public.style_template_audit_logs
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_style_templates t
    WHERE t.id = template_id
      AND t.submitted_by_user_id = (SELECT auth.uid())
  ));

REVOKE INSERT, UPDATE, DELETE ON public.style_template_audit_logs FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.style_template_audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.style_template_audit_logs FROM anon;
