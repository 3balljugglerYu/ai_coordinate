-- ===============================================
-- image_jobs / generated_images を inspire 対応に拡張
-- ===============================================

BEGIN;

-- image_jobs.generation_type CHECK 拡張
ALTER TABLE public.image_jobs
DROP CONSTRAINT IF EXISTS image_jobs_generation_type_check;

ALTER TABLE public.image_jobs
ADD CONSTRAINT image_jobs_generation_type_check
CHECK (
  generation_type IN (
    'coordinate',
    'specified_coordinate',
    'full_body',
    'chibi',
    'one_tap_style',
    'inspire'
  )
);

-- image_jobs に新規列追加（NULL 許容）
ALTER TABLE public.image_jobs
  ADD COLUMN IF NOT EXISTS style_template_id UUID
    REFERENCES public.user_style_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS style_reference_image_url TEXT,
  ADD COLUMN IF NOT EXISTS override_target TEXT;

COMMENT ON COLUMN public.image_jobs.style_template_id
  IS 'inspire 時のスタイルテンプレ参照（generation_type=''inspire'' のときのみ NOT NULL）';
COMMENT ON COLUMN public.image_jobs.style_reference_image_url
  IS 'inspire 時のテンプレ画像 URL（実体は Worker が style_template_id から解決して上書きする）';
COMMENT ON COLUMN public.image_jobs.override_target
  IS 'inspire でテンプレのどの要素を上書き再生成するか: angle|pose|outfit|background|NULL（NULL=keep_all）';

-- override_target の許可値 CHECK
ALTER TABLE public.image_jobs
DROP CONSTRAINT IF EXISTS image_jobs_override_target_check;

ALTER TABLE public.image_jobs
ADD CONSTRAINT image_jobs_override_target_check
CHECK (
  override_target IS NULL
  OR override_target IN ('angle', 'pose', 'outfit', 'background')
);

-- 整合性 CHECK
ALTER TABLE public.image_jobs
DROP CONSTRAINT IF EXISTS image_jobs_inspire_template_consistency_check;

ALTER TABLE public.image_jobs
ADD CONSTRAINT image_jobs_inspire_template_consistency_check
CHECK (
  (generation_type = 'inspire') = (style_template_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_image_jobs_style_template_id
  ON public.image_jobs (style_template_id)
  WHERE style_template_id IS NOT NULL;

-- generated_images.generation_type CHECK 拡張
ALTER TABLE public.generated_images
DROP CONSTRAINT IF EXISTS generated_images_generation_type_check;

ALTER TABLE public.generated_images
ADD CONSTRAINT generated_images_generation_type_check
CHECK (
  generation_type IN (
    'coordinate',
    'specified_coordinate',
    'full_body',
    'chibi',
    'one_tap_style',
    'inspire'
  )
);

ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS style_template_id UUID
    REFERENCES public.user_style_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_target TEXT;

COMMENT ON COLUMN public.generated_images.style_template_id
  IS 'inspire で生成された画像が参照したスタイルテンプレ';
COMMENT ON COLUMN public.generated_images.override_target
  IS 'inspire 生成時の override_target（image_jobs から継承）';

ALTER TABLE public.generated_images
DROP CONSTRAINT IF EXISTS generated_images_override_target_check;

ALTER TABLE public.generated_images
ADD CONSTRAINT generated_images_override_target_check
CHECK (
  override_target IS NULL
  OR override_target IN ('angle', 'pose', 'outfit', 'background')
);

ALTER TABLE public.generated_images
DROP CONSTRAINT IF EXISTS generated_images_inspire_template_consistency_check;

ALTER TABLE public.generated_images
ADD CONSTRAINT generated_images_inspire_template_consistency_check
CHECK (
  (generation_type = 'inspire') = (style_template_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_generated_images_style_template_id
  ON public.generated_images (style_template_id)
  WHERE style_template_id IS NOT NULL;

COMMIT;
