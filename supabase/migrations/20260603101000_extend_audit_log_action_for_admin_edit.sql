-- ===============================================
-- style_template_audit_logs.action に 'edit' を追加
-- ===============================================
-- 背景:
--   admin が hidden_prompt を手動編集した時の監査ログ用に新 action 値が必要。
--   既存 action 値 (submit/approve/reject/unpublish/withdraw/extract_failed) は
--   いずれも意味的に合わないため、新規に 'edit' を追加する。

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
    'extract_failed',
    'edit'
  ));

COMMIT;

-- ===============================================
-- DOWN: 'edit' を除いた enum に戻す (= 'edit' の行が存在しない前提)
-- BEGIN;
-- ALTER TABLE public.style_template_audit_logs
--   DROP CONSTRAINT IF EXISTS style_template_audit_logs_action_check;
-- ALTER TABLE public.style_template_audit_logs
--   ADD CONSTRAINT style_template_audit_logs_action_check
--   CHECK (action IN ('submit', 'approve', 'reject', 'unpublish', 'withdraw', 'extract_failed'));
-- COMMIT;
-- ===============================================
