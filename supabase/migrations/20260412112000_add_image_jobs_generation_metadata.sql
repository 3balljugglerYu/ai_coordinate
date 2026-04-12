-- Persist async job metadata so workers can copy one_tap_style preset info
-- into generated_images after the job completes.

ALTER TABLE public.image_jobs
ADD COLUMN IF NOT EXISTS generation_metadata JSONB;
