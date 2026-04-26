-- Drop legacy image metadata columns after Phase A removed all runtime usage.
-- `background_mode` is the source of truth for background behavior.
-- `width` / `height` are the source of truth for image dimensions and orientation derivation.

DROP INDEX IF EXISTS public.idx_generated_images_aspect_ratio;

ALTER TABLE public.generated_images
  DROP COLUMN IF EXISTS aspect_ratio,
  DROP COLUMN IF EXISTS background_change;

ALTER TABLE public.image_jobs
  DROP COLUMN IF EXISTS background_change;
