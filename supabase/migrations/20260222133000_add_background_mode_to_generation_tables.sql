-- 背景設定3択化対応:
-- image_jobs / generated_images に background_mode を追加し、
-- 既存の background_change(boolean) から backfill する。
-- 互換期間中は background_change を残して並行運用する。

ALTER TABLE public.image_jobs
ADD COLUMN IF NOT EXISTS background_mode text;

ALTER TABLE public.generated_images
ADD COLUMN IF NOT EXISTS background_mode text;

-- 既存データの移行:
-- background_change = true  -> ai_auto
-- それ以外                 -> keep
UPDATE public.image_jobs
SET background_mode = CASE
  WHEN COALESCE(background_change, false) THEN 'ai_auto'
  ELSE 'keep'
END
WHERE background_mode IS NULL
   OR background_mode NOT IN ('ai_auto', 'include_in_prompt', 'keep');

UPDATE public.generated_images
SET background_mode = CASE
  WHEN COALESCE(background_change, false) THEN 'ai_auto'
  ELSE 'keep'
END
WHERE background_mode IS NULL
   OR background_mode NOT IN ('ai_auto', 'include_in_prompt', 'keep');

ALTER TABLE public.image_jobs
ALTER COLUMN background_mode SET DEFAULT 'keep';

ALTER TABLE public.generated_images
ALTER COLUMN background_mode SET DEFAULT 'keep';

ALTER TABLE public.image_jobs
ALTER COLUMN background_mode SET NOT NULL;

ALTER TABLE public.generated_images
ALTER COLUMN background_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'image_jobs_background_mode_check'
      AND conrelid = 'public.image_jobs'::regclass
  ) THEN
    ALTER TABLE public.image_jobs
    ADD CONSTRAINT image_jobs_background_mode_check
    CHECK (background_mode = ANY (ARRAY['ai_auto'::text, 'include_in_prompt'::text, 'keep'::text]));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'generated_images_background_mode_check'
      AND conrelid = 'public.generated_images'::regclass
  ) THEN
    ALTER TABLE public.generated_images
    ADD CONSTRAINT generated_images_background_mode_check
    CHECK (background_mode = ANY (ARRAY['ai_auto'::text, 'include_in_prompt'::text, 'keep'::text]));
  END IF;
END $$;
