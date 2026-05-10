-- ===============================================
-- User Style Template Preview Attempts (レートリミット)
-- ===============================================

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

CREATE INDEX IF NOT EXISTS idx_user_style_template_preview_attempts_user_attempted
  ON public.user_style_template_preview_attempts (user_id, attempted_at DESC);

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
