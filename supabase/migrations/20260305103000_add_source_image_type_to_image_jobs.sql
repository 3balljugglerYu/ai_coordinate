-- 画像タイプ選択対応:
-- image_jobs に source_image_type を追加し、アップロード画像のタイプ
-- (illustration / real) をプロンプト構築時に利用できるようにする。

ALTER TABLE public.image_jobs
ADD COLUMN IF NOT EXISTS source_image_type text;

UPDATE public.image_jobs
SET source_image_type = 'illustration'
WHERE source_image_type IS NULL
   OR source_image_type NOT IN ('illustration', 'real');

ALTER TABLE public.image_jobs
ALTER COLUMN source_image_type SET DEFAULT 'illustration';

ALTER TABLE public.image_jobs
ALTER COLUMN source_image_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'image_jobs_source_image_type_check'
      AND conrelid = 'public.image_jobs'::regclass
  ) THEN
    ALTER TABLE public.image_jobs
    ADD CONSTRAINT image_jobs_source_image_type_check
    CHECK (source_image_type = ANY (ARRAY['illustration'::text, 'real'::text]));
  END IF;
END $$;
