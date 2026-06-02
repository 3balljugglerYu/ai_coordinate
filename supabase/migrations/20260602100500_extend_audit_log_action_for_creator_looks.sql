-- ===============================================
-- style_template_audit_logs.action CHECK 拡張
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-012
--
-- Creator Looks の meta-prompt 抽出失敗を audit log に残すために 'extract_failed' を追加。
-- 既存値 ('submit', 'approve', 'reject', 'unpublish', 'withdraw') と共存。

BEGIN;

ALTER TABLE public.style_template_audit_logs
DROP CONSTRAINT IF EXISTS style_template_audit_logs_action_check;

ALTER TABLE public.style_template_audit_logs
ADD CONSTRAINT style_template_audit_logs_action_check
CHECK (action IN (
  'submit',
  'approve',
  'reject',
  'unpublish',
  'withdraw',
  'extract_failed'
));

COMMENT ON COLUMN public.style_template_audit_logs.action IS
  'submit | approve | reject | unpublish | withdraw | extract_failed (Creator Looks の meta-prompt 抽出失敗)';

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- ALTER TABLE public.style_template_audit_logs DROP CONSTRAINT IF EXISTS style_template_audit_logs_action_check;
-- ALTER TABLE public.style_template_audit_logs ADD CONSTRAINT style_template_audit_logs_action_check
--   CHECK (action IN ('submit', 'approve', 'reject', 'unpublish', 'withdraw'));
-- COMMIT;
-- ===============================================
