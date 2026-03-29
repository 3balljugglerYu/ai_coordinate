ALTER TABLE public.image_jobs
ADD COLUMN IF NOT EXISTS processing_stage TEXT;

UPDATE public.image_jobs
SET processing_stage = CASE
  WHEN status = 'queued' THEN 'queued'
  WHEN status = 'processing' THEN 'processing'
  WHEN status = 'succeeded' THEN 'completed'
  WHEN status = 'failed' THEN 'failed'
  ELSE 'queued'
END
WHERE processing_stage IS NULL;

ALTER TABLE public.image_jobs
ALTER COLUMN processing_stage SET DEFAULT 'queued';

ALTER TABLE public.image_jobs
ALTER COLUMN processing_stage SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'image_jobs_processing_stage_check'
      AND conrelid = 'public.image_jobs'::regclass
  ) THEN
    ALTER TABLE public.image_jobs
    ADD CONSTRAINT image_jobs_processing_stage_check
    CHECK (
      processing_stage IN (
        'queued',
        'processing',
        'charging',
        'generating',
        'uploading',
        'persisting',
        'completed',
        'failed'
      )
    );
  END IF;
END $$;
