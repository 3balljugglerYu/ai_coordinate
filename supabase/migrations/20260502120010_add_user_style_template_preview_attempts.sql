-- ===============================================
-- User Style Template Preview Attempts (レートリミット)
-- ===============================================
-- ADR-004 / REQ-S-03 参照
-- 過去 24 時間で 10 回以上プレビュー生成を試みたユーザーは 429 で拒否する。
-- /api/style-templates/preview-generation が試行ごとに 1 行 INSERT する。

CREATE TABLE IF NOT EXISTS public.user_style_template_preview_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT NOT NULL
    CHECK (outcome IN ('success', 'partial', 'failed', 'rate_limited'))
);

COMMENT ON TABLE public.user_style_template_preview_attempts
  IS 'Inspire 機能: プレビュー生成のレートリミット用試行ログ（24h で 10 回まで）';
COMMENT ON COLUMN public.user_style_template_preview_attempts.outcome
  IS 'success=両方成功 / partial=片肺成功 / failed=両方失敗 / rate_limited=制限超過で拒否';

-- (user_id, attempted_at) 索引: レートリミット集計（直近 24h の COUNT）+ FK 索引兼任
CREATE INDEX IF NOT EXISTS idx_user_style_template_preview_attempts_user_attempted
  ON public.user_style_template_preview_attempts (user_id, attempted_at DESC);

-- ===============================================
-- RLS（own のみ）
-- ===============================================

ALTER TABLE public.user_style_template_preview_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "preview_attempts_select_own" ON public.user_style_template_preview_attempts;
CREATE POLICY "preview_attempts_select_own"
  ON public.user_style_template_preview_attempts
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "preview_attempts_insert_own" ON public.user_style_template_preview_attempts;
CREATE POLICY "preview_attempts_insert_own"
  ON public.user_style_template_preview_attempts
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ===============================================
-- DOWN:
-- DROP TABLE IF EXISTS public.user_style_template_preview_attempts;
-- ===============================================
