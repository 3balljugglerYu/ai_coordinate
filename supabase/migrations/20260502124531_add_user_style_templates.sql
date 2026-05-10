-- ===============================================
-- User Style Templates (Inspire 機能の中核テーブル)
-- ===============================================

CREATE TABLE IF NOT EXISTS public.user_style_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT,
  storage_path TEXT,
  alt TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (moderation_status IN ('draft', 'pending', 'visible', 'removed', 'withdrawn')),
  moderation_reason TEXT,
  moderation_updated_at TIMESTAMPTZ,
  moderation_approved_at TIMESTAMPTZ,
  moderation_decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  copyright_consent_at TIMESTAMPTZ,
  preview_openai_image_url TEXT,
  preview_gemini_image_url TEXT,
  preview_generated_at TIMESTAMPTZ,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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

-- インデックス（partial index）
CREATE INDEX IF NOT EXISTS idx_user_style_templates_visible_order
  ON public.user_style_templates (display_order ASC, created_at DESC)
  WHERE moderation_status = 'visible';

CREATE INDEX IF NOT EXISTS idx_user_style_templates_pending_created
  ON public.user_style_templates (created_at DESC)
  WHERE moderation_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_user_style_templates_draft_created
  ON public.user_style_templates (created_at)
  WHERE moderation_status = 'draft';

CREATE INDEX IF NOT EXISTS idx_user_style_templates_submitter
  ON public.user_style_templates (submitted_by_user_id, moderation_status);

CREATE INDEX IF NOT EXISTS idx_user_style_templates_decided_by
  ON public.user_style_templates (moderation_decided_by)
  WHERE moderation_decided_by IS NOT NULL;

-- updated_at トリガ
DROP TRIGGER IF EXISTS update_user_style_templates_updated_at ON public.user_style_templates;
CREATE TRIGGER update_user_style_templates_updated_at
  BEFORE UPDATE ON public.user_style_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 申請数 cap トリガ
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
  IF NEW.moderation_status <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.moderation_status = NEW.moderation_status THEN
    RETURN NEW;
  END IF;

  v_lock_key := hashtextextended('user_style_template_cap:' || NEW.submitted_by_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COUNT(*) INTO v_active_count
  FROM public.user_style_templates
  WHERE submitted_by_user_id = NEW.submitted_by_user_id
    AND moderation_status IN ('pending', 'visible')
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'user_style_template_submission_cap_exceeded'
      USING ERRCODE = '23514',
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

-- RLS
ALTER TABLE public.user_style_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_style_templates_select_visible" ON public.user_style_templates;
CREATE POLICY "user_style_templates_select_visible"
  ON public.user_style_templates
  FOR SELECT
  USING (moderation_status = 'visible');

DROP POLICY IF EXISTS "user_style_templates_select_own" ON public.user_style_templates;
CREATE POLICY "user_style_templates_select_own"
  ON public.user_style_templates
  FOR SELECT
  USING ((SELECT auth.uid()) = submitted_by_user_id);

DROP POLICY IF EXISTS "user_style_templates_select_admin" ON public.user_style_templates;
CREATE POLICY "user_style_templates_select_admin"
  ON public.user_style_templates
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

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

DROP POLICY IF EXISTS "user_style_templates_delete_own_draft" ON public.user_style_templates;
CREATE POLICY "user_style_templates_delete_own_draft"
  ON public.user_style_templates
  FOR DELETE
  USING (
    (SELECT auth.uid()) = submitted_by_user_id
    AND moderation_status = 'draft'
  );
