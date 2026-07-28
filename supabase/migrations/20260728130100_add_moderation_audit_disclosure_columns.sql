-- ===============================================
-- moderation_audit_logs: 投稿者開示用カラムの追加と RLS 是正
-- ===============================================
-- 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
--           ADR-003, ADR-009, ADR-011 / REQ-022, REQ-024, REQ-025
--
-- 【目的1】投稿者に開示する項目を metadata から独立した列に分離する
--
-- 本計画は moderation_audit_logs を削除判定の source of truth とし、投稿者向け
-- ページ /my-page/moderation/decisions/{id} をこの上に構築する。
-- ここで metadata に開示項目を同居させると、「開示に必要な値を取るために
-- metadata を読む」→「同じ JSON にある weightedScore / recentCount も一緒に
-- 取れてしまう」構造になり、通報者の匿名性 (ADR-011) が骨抜きになる。
--
-- したがって:
--   - 投稿者に開示してよい項目 = 専用カラム
--   - 運営内部専用 (通報件数・加重スコア・冪等キー等) = metadata
-- と用途を分離し、投稿者向けの取得では metadata / actor_id / internal_note を
-- 一切射影しないルールを単純かつ監査可能にする。
--
-- 【目的2】RLS の是正
--
-- 現状の policy は SELECT / INSERT ともに auth.role() = 'authenticated' で、
-- **任意のログインユーザーが全モデレーション判定を閲覧でき、任意の行を
-- INSERT できる**。削除理由の正本として使う前に service_role 専用へ絞る。
-- アプリコードからこのテーブルを参照している箇所は存在しない (grep 済み) ため、
-- policy 削除による既存機能への影響はない。

BEGIN;

-- ── 開示用カラム (投稿者に見せてよい) ────────────────────────────────
ALTER TABLE public.moderation_audit_logs
  ADD COLUMN IF NOT EXISTS policy_code TEXT,
  ADD COLUMN IF NOT EXISTS policy_version TEXT,
  ADD COLUMN IF NOT EXISTS policy_anchor TEXT,
  ADD COLUMN IF NOT EXISTS author_facing_reason TEXT,
  ADD COLUMN IF NOT EXISTS restriction_scope TEXT,
  ADD COLUMN IF NOT EXISTS restriction_duration TEXT,
  ADD COLUMN IF NOT EXISTS decision_source TEXT,
  ADD COLUMN IF NOT EXISTS automated_means_used BOOLEAN;

-- ── 運営内部専用カラム (投稿者に絶対に見せない) ──────────────────────
ALTER TABLE public.moderation_audit_logs
  ADD COLUMN IF NOT EXISTS internal_note TEXT;

COMMENT ON COLUMN public.moderation_audit_logs.author_facing_reason IS
  '投稿者に表示する説明。reject 時は必須。通報者を特定できる情報を含めてはならない (ADR-011)。';
COMMENT ON COLUMN public.moderation_audit_logs.internal_note IS
  '運営内部メモ。投稿者向けレスポンスに絶対に含めないこと (ADR-011 / REQ-022)。';
COMMENT ON COLUMN public.moderation_audit_logs.metadata IS
  '運営内部専用。weightedScore / recentCount / activeUsers / idempotency_key 等。投稿者向けに射影しないこと (ADR-011 / REQ-023)。';
COMMENT ON COLUMN public.moderation_audit_logs.actor_id IS
  'action=pending_auto では通報したユーザー本人が入る。投稿者向けに射影しないこと (ADR-011 / REQ-022)。';

-- ── RLS 是正: authenticated 全体への開放を撤去し service_role 専用にする ──
DROP POLICY IF EXISTS "Authenticated can view moderation logs" ON public.moderation_audit_logs;
DROP POLICY IF EXISTS "Authenticated can insert moderation logs" ON public.moderation_audit_logs;

-- policy を一切作らない = RLS 有効かつ許可なし。
-- service_role クライアントと SECURITY DEFINER 関数のみが読み書きできる。
-- (RLS は table owner / service_role をバイパスするため、既存 RPC は影響を受けない)

-- 投稿者向け詳細ページの引き当て用。reject 行を post 単位で新しい順に引く。
CREATE INDEX IF NOT EXISTS idx_moderation_audit_logs_post_action_created
  ON public.moderation_audit_logs (post_id, action, created_at DESC);

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP INDEX IF EXISTS public.idx_moderation_audit_logs_post_action_created;
-- ALTER TABLE public.moderation_audit_logs
--   DROP COLUMN IF EXISTS policy_code,
--   DROP COLUMN IF EXISTS policy_version,
--   DROP COLUMN IF EXISTS policy_anchor,
--   DROP COLUMN IF EXISTS author_facing_reason,
--   DROP COLUMN IF EXISTS restriction_scope,
--   DROP COLUMN IF EXISTS restriction_duration,
--   DROP COLUMN IF EXISTS decision_source,
--   DROP COLUMN IF EXISTS automated_means_used,
--   DROP COLUMN IF EXISTS internal_note;
-- COMMIT;
--
-- 注意: RLS policy の復活は行わない。authenticated 全体への
-- SELECT/INSERT 開放は情報漏洩であり、再導入してはならない。
-- ===============================================
