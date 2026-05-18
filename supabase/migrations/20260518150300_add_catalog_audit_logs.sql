-- ===============================================
-- Catalog Audit Logs
-- ===============================================
-- 絵師カタログのエントリーに対する操作履歴。
-- - submit: ゲスト/会員の投稿
-- - approve: admin の承認
-- - reject: admin の差戻し
-- - unpublish: admin の事後非公開化
-- - withdraw: 投稿者の取り下げ (Phase 2 候補。MVP では未実装)
--
-- ゲスト投稿のため actor_id は nullable。

CREATE TABLE IF NOT EXISTS public.catalog_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.catalog_entries(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL
    CHECK (action IN ('submit', 'approve', 'reject', 'unpublish', 'withdraw')),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalog_audit_logs IS '絵師カタログのエントリー単位の監査履歴';
COMMENT ON COLUMN public.catalog_audit_logs.actor_id IS '操作実行者の auth.users.id。ゲスト投稿の submit では NULL';
COMMENT ON COLUMN public.catalog_audit_logs.action IS 'submit / approve / reject / unpublish / withdraw';

CREATE INDEX IF NOT EXISTS idx_catalog_audit_logs_entry_created
  ON public.catalog_audit_logs (entry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_catalog_audit_logs_actor_created
  ON public.catalog_audit_logs (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

ALTER TABLE public.catalog_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_audit_logs_select_admin" ON public.catalog_audit_logs;
CREATE POLICY "catalog_audit_logs_select_admin"
  ON public.catalog_audit_logs
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

-- 会員投稿者は自分のエントリーの履歴を読める
DROP POLICY IF EXISTS "catalog_audit_logs_select_submitter" ON public.catalog_audit_logs;
CREATE POLICY "catalog_audit_logs_select_submitter"
  ON public.catalog_audit_logs
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.catalog_entries e
    WHERE e.id = entry_id
      AND e.submitter_user_id IS NOT NULL
      AND e.submitter_user_id = (SELECT auth.uid())
  ));

-- INSERT/UPDATE/DELETE は禁止 (RPC 経由のみ)
REVOKE INSERT, UPDATE, DELETE ON public.catalog_audit_logs FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.catalog_audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.catalog_audit_logs FROM anon;

-- ===============================================
-- DOWN:
-- DROP TABLE IF EXISTS public.catalog_audit_logs CASCADE;
-- ===============================================
