-- ===============================================
-- User Style Templates (Inspire 機能の中核テーブル)
-- 認証ユーザーが申請するスタイルテンプレートの本体
-- ===============================================
-- ADR-001 / ADR-005 / ADR-009 / ADR-012 参照
-- 状態遷移: draft → pending → visible | removed | withdrawn
--
-- /supabase-postgres-best-practices 準拠:
--   - RLS は (SELECT auth.uid()) 形式（security-rls-performance）
--   - FK 列は索引化（schema-foreign-key-indexes）
--   - moderation_status で絞る索引は partial index（query-partial-indexes）
--   - cap トリガは pg_advisory_xact_lock(bigint) 単一引数版（lock-advisory）

-- ===============================================
-- 1. テーブル本体
-- ===============================================

CREATE TABLE IF NOT EXISTS public.user_style_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- テンプレート画像本体
  image_url TEXT,
  storage_path TEXT,
  alt TEXT,

  -- モデレーション
  moderation_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (moderation_status IN ('draft', 'pending', 'visible', 'removed', 'withdrawn')),
  moderation_reason TEXT,
  moderation_updated_at TIMESTAMPTZ,
  moderation_approved_at TIMESTAMPTZ,
  moderation_decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 著作権同意（pending 以降では NOT NULL である必要がある）
  copyright_consent_at TIMESTAMPTZ,

  -- プレビュー画像（同期生成された 2 モデル分）
  preview_openai_image_url TEXT,
  preview_gemini_image_url TEXT,
  preview_generated_at TIMESTAMPTZ,

  -- 表示順
  display_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 整合性 CHECK: pending 以降は同意済みでなければならない
  CONSTRAINT user_style_templates_consent_required
    CHECK (moderation_status = 'draft' OR copyright_consent_at IS NOT NULL)
);

COMMENT ON TABLE public.user_style_templates IS 'Inspire 機能: 認証ユーザーが申請するスタイルテンプレート';
COMMENT ON COLUMN public.user_style_templates.submitted_by_user_id IS '申請者の auth.users.id';
COMMENT ON COLUMN public.user_style_templates.image_url IS '申請されたテンプレート画像 URL（private バケット、署名 URL 経由でアクセス）';
COMMENT ON COLUMN public.user_style_templates.storage_path IS 'style-templates バケット内のオブジェクトパス';
COMMENT ON COLUMN public.user_style_templates.moderation_status IS 'draft|pending|visible|removed|withdrawn';
COMMENT ON COLUMN public.user_style_templates.moderation_decided_by IS '承認/差戻し/非公開化を行った admin の auth.users.id';
COMMENT ON COLUMN public.user_style_templates.copyright_consent_at IS '著作権同意のタイムスタンプ（サーバ側で now() を記録）';
COMMENT ON COLUMN public.user_style_templates.preview_openai_image_url IS 'OpenAI gpt-image-2-low で生成したプレビュー画像 URL';
COMMENT ON COLUMN public.user_style_templates.preview_gemini_image_url IS 'Gemini 0.5K で生成したプレビュー画像 URL';
COMMENT ON COLUMN public.user_style_templates.display_order IS 'ホームカルーセルの表示順（admin が DnD で編集）';

-- ===============================================
-- 2. インデックス（partial index で必要な状態のみに絞る）
-- ===============================================

-- ホームカルーセル: visible のみ、display_order ASC, created_at DESC
CREATE INDEX IF NOT EXISTS idx_user_style_templates_visible_order
  ON public.user_style_templates (display_order ASC, created_at DESC)
  WHERE moderation_status = 'visible';

-- admin 審査キュー: pending のみ、created_at DESC
CREATE INDEX IF NOT EXISTS idx_user_style_templates_pending_created
  ON public.user_style_templates (created_at DESC)
  WHERE moderation_status = 'pending';

-- cleanup function 用: draft のみ、created_at（古い順に拾う）
CREATE INDEX IF NOT EXISTS idx_user_style_templates_draft_created
  ON public.user_style_templates (created_at)
  WHERE moderation_status = 'draft';

-- 申請者の自己一覧 + FK 索引兼任
CREATE INDEX IF NOT EXISTS idx_user_style_templates_submitter
  ON public.user_style_templates (submitted_by_user_id, moderation_status);

-- moderation_decided_by の FK 索引（CASCADE 高速化）
CREATE INDEX IF NOT EXISTS idx_user_style_templates_decided_by
  ON public.user_style_templates (moderation_decided_by)
  WHERE moderation_decided_by IS NOT NULL;

-- ===============================================
-- 3. updated_at トリガ
-- ===============================================

DROP TRIGGER IF EXISTS update_user_style_templates_updated_at ON public.user_style_templates;
CREATE TRIGGER update_user_style_templates_updated_at
  BEFORE UPDATE ON public.user_style_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===============================================
-- 4. 申請数 cap トリガ（pending + visible で 5 件まで）
-- ===============================================
-- REQ-S-07: ユーザーが pending または visible を 5 件以上保有している場合、
--           申請昇格を 429 で拒否する。DB 層では check_violation を返す。
--
-- 並行性対策: pg_advisory_xact_lock(bigint) 単一引数版でユーザー単位の排他ロックを取得してから count
--           ※ /supabase-postgres-best-practices の lock-advisory 準拠

CREATE OR REPLACE FUNCTION public.enforce_user_style_template_submission_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count INTEGER;
  v_lock_key BIGINT;
BEGIN
  -- pending への遷移時のみチェック
  IF NEW.moderation_status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- UPDATE で OLD.status='pending' のままなら状態遷移ではないのでスキップ
  IF TG_OP = 'UPDATE' AND OLD.moderation_status = NEW.moderation_status THEN
    RETURN NEW;
  END IF;

  -- ユーザー単位の排他ロック（同一ユーザーからの 2 並列 submit を防ぐ）
  v_lock_key := hashtextextended('user_style_template_cap:' || NEW.submitted_by_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- pending または visible の件数を数える（自分自身は UPDATE の場合のみ除外）
  SELECT COUNT(*) INTO v_active_count
  FROM public.user_style_templates
  WHERE submitted_by_user_id = NEW.submitted_by_user_id
    AND moderation_status IN ('pending', 'visible')
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'user_style_template_submission_cap_exceeded'
      USING ERRCODE = '23514',  -- check_violation
            HINT = 'A user can have at most 5 templates in pending or visible state.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_user_style_template_submission_cap ON public.user_style_templates;
CREATE TRIGGER trg_enforce_user_style_template_submission_cap
  BEFORE INSERT OR UPDATE OF moderation_status ON public.user_style_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_style_template_submission_cap();

-- ===============================================
-- 5. RLS（(SELECT auth.uid()) 形式で記述）
-- ===============================================

ALTER TABLE public.user_style_templates ENABLE ROW LEVEL SECURITY;

-- SELECT: 公開行（visible）は誰でも閲覧可
DROP POLICY IF EXISTS "user_style_templates_select_visible" ON public.user_style_templates;
CREATE POLICY "user_style_templates_select_visible"
  ON public.user_style_templates
  FOR SELECT
  USING (moderation_status = 'visible');

-- SELECT: 申請者は自分の行を全状態で閲覧可
DROP POLICY IF EXISTS "user_style_templates_select_own" ON public.user_style_templates;
CREATE POLICY "user_style_templates_select_own"
  ON public.user_style_templates
  FOR SELECT
  USING ((SELECT auth.uid()) = submitted_by_user_id);

-- SELECT: admin は全行閲覧可
DROP POLICY IF EXISTS "user_style_templates_select_admin" ON public.user_style_templates;
CREATE POLICY "user_style_templates_select_admin"
  ON public.user_style_templates
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

-- UPDATE: 申請者は pending/visible → withdrawn の取り下げのみ可
-- USING で旧状態を、WITH CHECK で新状態を制約
DROP POLICY IF EXISTS "user_style_templates_update_withdraw" ON public.user_style_templates;
CREATE POLICY "user_style_templates_update_withdraw"
  ON public.user_style_templates
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = submitted_by_user_id
    AND moderation_status IN ('pending', 'visible')
  )
  WITH CHECK (
    (SELECT auth.uid()) = submitted_by_user_id
    AND moderation_status = 'withdrawn'
  );

-- DELETE: 申請者は draft のみ完全削除可
DROP POLICY IF EXISTS "user_style_templates_delete_own_draft" ON public.user_style_templates;
CREATE POLICY "user_style_templates_delete_own_draft"
  ON public.user_style_templates
  FOR DELETE
  USING (
    (SELECT auth.uid()) = submitted_by_user_id
    AND moderation_status = 'draft'
  );

-- INSERT は SECURITY DEFINER の create_user_style_template_draft RPC のみが行う
-- → INSERT ポリシーを作らないことで、authenticated からの直 INSERT を不可にする

-- ===============================================
-- DOWN:
-- DROP TRIGGER IF EXISTS trg_enforce_user_style_template_submission_cap ON public.user_style_templates;
-- DROP TRIGGER IF EXISTS update_user_style_templates_updated_at ON public.user_style_templates;
-- DROP FUNCTION IF EXISTS public.enforce_user_style_template_submission_cap();
-- DROP TABLE IF EXISTS public.user_style_templates;
-- ===============================================
