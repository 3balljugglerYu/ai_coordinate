-- ===============================================
-- Creator Looks: creator_looks_allowlist テーブル新規
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-006, REQ-017
--
-- Stage 1 では未使用 (= テーブルが空である状態を前提とする)。
-- Stage 2 でファウンディングクリエイター招待時に admin が INSERT する。
--
-- fail-closed 設計: テーブルが空ならアプリ層の isInAllowlist(user) は false を返す。
-- これにより、env が誤って true になってもユーザーが意図せず開放されない。
--
-- 既存 INSPIRE_SUBMISSION_ALLOWED_USER_IDS の fail-open パターンとは意図的に逆向き。

BEGIN;

CREATE TABLE IF NOT EXISTS public.creator_looks_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE
    REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.creator_looks_allowlist IS
  'Stage 2 用: Creator Looks 機能を開放するユーザーリスト。Stage 1 では空であることを前提';
COMMENT ON COLUMN public.creator_looks_allowlist.user_id IS
  '機能を開放する対象の auth.users.id';
COMMENT ON COLUMN public.creator_looks_allowlist.added_by IS
  '招待を登録した admin の auth.users.id (= 監査用)';
COMMENT ON COLUMN public.creator_looks_allowlist.note IS
  '招待理由メモ (社内用)';
COMMENT ON COLUMN public.creator_looks_allowlist.is_active IS
  'false にすると判定は false を返す (= 一時停止)';

-- インデックス: 高頻度な isInAllowlist 判定の高速化
CREATE INDEX IF NOT EXISTS idx_creator_looks_allowlist_active_user
  ON public.creator_looks_allowlist (user_id)
  WHERE is_active = true;

-- RLS 有効化
ALTER TABLE public.creator_looks_allowlist ENABLE ROW LEVEL SECURITY;

-- 通常ロールは原則 deny。本人だけ自分の行を SELECT 可。
REVOKE ALL ON TABLE public.creator_looks_allowlist FROM PUBLIC;
REVOKE ALL ON TABLE public.creator_looks_allowlist FROM anon;
REVOKE ALL ON TABLE public.creator_looks_allowlist FROM authenticated;

-- authenticated には SELECT のみ付与 (RLS で行絞り込み)
GRANT SELECT ON TABLE public.creator_looks_allowlist TO authenticated;

DROP POLICY IF EXISTS "creator_looks_allowlist_self_select" ON public.creator_looks_allowlist;
CREATE POLICY "creator_looks_allowlist_self_select"
  ON public.creator_looks_allowlist
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- INSERT / UPDATE / DELETE は admin のみ可
-- admin 判定は admin_users テーブル (既存) との EXISTS チェック
DROP POLICY IF EXISTS "creator_looks_allowlist_admin_insert" ON public.creator_looks_allowlist;
CREATE POLICY "creator_looks_allowlist_admin_insert"
  ON public.creator_looks_allowlist
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "creator_looks_allowlist_admin_update" ON public.creator_looks_allowlist;
CREATE POLICY "creator_looks_allowlist_admin_update"
  ON public.creator_looks_allowlist
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "creator_looks_allowlist_admin_delete" ON public.creator_looks_allowlist;
CREATE POLICY "creator_looks_allowlist_admin_delete"
  ON public.creator_looks_allowlist
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- updated_at auto-update trigger (既存パターン)
CREATE OR REPLACE FUNCTION public.update_creator_looks_allowlist_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_creator_looks_allowlist_updated_at
  ON public.creator_looks_allowlist;
CREATE TRIGGER trg_update_creator_looks_allowlist_updated_at
  BEFORE UPDATE ON public.creator_looks_allowlist
  FOR EACH ROW
  EXECUTE FUNCTION public.update_creator_looks_allowlist_updated_at();

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_update_creator_looks_allowlist_updated_at ON public.creator_looks_allowlist;
-- DROP FUNCTION IF EXISTS public.update_creator_looks_allowlist_updated_at();
-- DROP POLICY IF EXISTS "creator_looks_allowlist_admin_delete" ON public.creator_looks_allowlist;
-- DROP POLICY IF EXISTS "creator_looks_allowlist_admin_update" ON public.creator_looks_allowlist;
-- DROP POLICY IF EXISTS "creator_looks_allowlist_admin_insert" ON public.creator_looks_allowlist;
-- DROP POLICY IF EXISTS "creator_looks_allowlist_self_select" ON public.creator_looks_allowlist;
-- DROP INDEX IF EXISTS idx_creator_looks_allowlist_active_user;
-- DROP TABLE IF EXISTS public.creator_looks_allowlist;
-- COMMIT;
-- ===============================================
