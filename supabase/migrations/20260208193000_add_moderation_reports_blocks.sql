-- ===============================================
-- Moderation (Reports / Blocks / Pending) Migration
-- ===============================================

-- generated_images にモデレーション関連カラムを追加
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderation_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'generated_images_moderation_status_check'
  ) THEN
    ALTER TABLE public.generated_images
      ADD CONSTRAINT generated_images_moderation_status_check
      CHECK (moderation_status IN ('visible', 'pending', 'removed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_generated_images_moderation_status_posted
  ON public.generated_images (moderation_status, posted_at DESC)
  WHERE is_posted = true;

-- ===============================================
-- post_reports
-- ===============================================
CREATE TABLE IF NOT EXISTS public.post_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.generated_images(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  subcategory_id TEXT NOT NULL,
  details TEXT,
  weight NUMERIC(4, 2) NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_reports_post_id_created_at
  ON public.post_reports (post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_reports_reporter_id_created_at
  ON public.post_reports (reporter_id, created_at DESC);

ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own post reports" ON public.post_reports;
CREATE POLICY "Users can view their own post reports"
  ON public.post_reports
  FOR SELECT
  USING ((select auth.uid()) = reporter_id);

DROP POLICY IF EXISTS "Users can create their own post reports" ON public.post_reports;
CREATE POLICY "Users can create their own post reports"
  ON public.post_reports
  FOR INSERT
  WITH CHECK ((select auth.uid()) = reporter_id);

DROP POLICY IF EXISTS "Users can delete their own post reports" ON public.post_reports;
CREATE POLICY "Users can delete their own post reports"
  ON public.post_reports
  FOR DELETE
  USING ((select auth.uid()) = reporter_id);

-- ===============================================
-- user_blocks
-- ===============================================
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_id_created_at
  ON public.user_blocks (blocker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_id_created_at
  ON public.user_blocks (blocked_id, created_at DESC);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view related blocks" ON public.user_blocks;
CREATE POLICY "Users can view related blocks"
  ON public.user_blocks
  FOR SELECT
  USING ((select auth.uid()) = blocker_id OR (select auth.uid()) = blocked_id);

DROP POLICY IF EXISTS "Users can create blocks" ON public.user_blocks;
CREATE POLICY "Users can create blocks"
  ON public.user_blocks
  FOR INSERT
  WITH CHECK ((select auth.uid()) = blocker_id);

DROP POLICY IF EXISTS "Users can delete own blocks" ON public.user_blocks;
CREATE POLICY "Users can delete own blocks"
  ON public.user_blocks
  FOR DELETE
  USING ((select auth.uid()) = blocker_id);

-- ===============================================
-- moderation_audit_logs
-- ===============================================
CREATE TABLE IF NOT EXISTS public.moderation_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.generated_images(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('pending_auto', 'approve', 'reject')),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_logs_post_id_created_at
  ON public.moderation_audit_logs (post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_logs_actor_id_created_at
  ON public.moderation_audit_logs (actor_id, created_at DESC);

ALTER TABLE public.moderation_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view moderation logs" ON public.moderation_audit_logs;
CREATE POLICY "Authenticated can view moderation logs"
  ON public.moderation_audit_logs
  FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can insert moderation logs" ON public.moderation_audit_logs;
CREATE POLICY "Authenticated can insert moderation logs"
  ON public.moderation_audit_logs
  FOR INSERT
  WITH CHECK ((select auth.role()) = 'authenticated');
