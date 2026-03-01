-- ===============================================
-- Moderation approved snapshot timestamp
-- ===============================================

ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS moderation_approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_generated_images_moderation_approved_at
  ON public.generated_images (moderation_approved_at DESC)
  WHERE moderation_approved_at IS NOT NULL;
