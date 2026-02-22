-- 管理者操作ログテーブル
-- ボーナス付与、審査判定、ユーザー停止/復帰などの操作を記録
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- インデックス: 日付・管理者・アクション種別での検索用
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user_id
  ON public.admin_audit_log (admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action_type
  ON public.admin_audit_log (action_type);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON public.admin_audit_log (target_type, target_id);

-- RLS: 管理者のみ閲覧可能（Service Role でバイパスするため、ポリシーは厳格に）
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- 管理者以外は一切アクセス不可
-- 注意: 管理者判定はアプリケーション層（ADMIN_USER_IDS）で行う
-- ここでは Service Role を使用する API 経由でのみアクセスする想定
CREATE POLICY "admin_audit_log_no_public_access"
  ON public.admin_audit_log
  FOR ALL
  USING (false);

-- Service Role は RLS をバイパスするため、上記ポリシーは anon/authenticated にのみ適用される

COMMENT ON TABLE public.admin_audit_log IS '管理者操作の監査ログ（ボーナス付与、審査、ユーザー停止等）';
