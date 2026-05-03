-- ===============================================
-- image_jobs / generated_images を inspire 対応に拡張
-- ===============================================
-- ADR-002 参照
-- generation_type に 'inspire' を追加し、2 枚目画像の参照列を新設する。
--
-- 既存の generation_type CHECK は緩和方向（許可値追加）なので互換性あり。
-- 新規列はすべて NULL 許容。整合性 CHECK で inspire のときのみ
-- style_template_id が必須となるよう強制する。

BEGIN;

-- ===============================================
-- 1. image_jobs.generation_type CHECK 拡張
-- ===============================================
-- 既存: ('coordinate', 'specified_coordinate', 'full_body', 'chibi', 'one_tap_style')
-- 拡張後: 上記 + 'inspire'
-- 既存パターン: 20260411153000_allow_one_tap_style_generation_type.sql を踏襲

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

-- ===============================================
-- 2. image_jobs に新規列追加（NULL 許容）
-- ===============================================

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

-- 整合性 CHECK: inspire のときのみ style_template_id が必須
ALTER TABLE public.image_jobs
DROP CONSTRAINT IF EXISTS image_jobs_inspire_template_consistency_check;

ALTER TABLE public.image_jobs
ADD CONSTRAINT image_jobs_inspire_template_consistency_check
CHECK (
  (generation_type = 'inspire') = (style_template_id IS NOT NULL)
);

-- inspire ジョブ用の FK 索引（CASCADE / JOIN 高速化）
CREATE INDEX IF NOT EXISTS idx_image_jobs_style_template_id
  ON public.image_jobs (style_template_id)
  WHERE style_template_id IS NOT NULL;

-- ===============================================
-- 3. generated_images.generation_type CHECK 拡張
-- ===============================================

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

-- ===============================================
-- 4. generated_images に新規列追加（NULL 許容）
-- ===============================================

ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS style_template_id UUID
    REFERENCES public.user_style_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_target TEXT;

COMMENT ON COLUMN public.generated_images.style_template_id
  IS 'inspire で生成された画像が参照したスタイルテンプレ';
COMMENT ON COLUMN public.generated_images.override_target
  IS 'inspire 生成時の override_target（image_jobs から継承）';

-- override_target の許可値 CHECK
ALTER TABLE public.generated_images
DROP CONSTRAINT IF EXISTS generated_images_override_target_check;

ALTER TABLE public.generated_images
ADD CONSTRAINT generated_images_override_target_check
CHECK (
  override_target IS NULL
  OR override_target IN ('angle', 'pose', 'outfit', 'background')
);

-- 整合性 CHECK
ALTER TABLE public.generated_images
DROP CONSTRAINT IF EXISTS generated_images_inspire_template_consistency_check;

ALTER TABLE public.generated_images
ADD CONSTRAINT generated_images_inspire_template_consistency_check
CHECK (
  (generation_type = 'inspire') = (style_template_id IS NOT NULL)
);

-- 索引（FK 索引兼集計用）
CREATE INDEX IF NOT EXISTS idx_generated_images_style_template_id
  ON public.generated_images (style_template_id)
  WHERE style_template_id IS NOT NULL;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP INDEX IF EXISTS public.idx_generated_images_style_template_id;
-- ALTER TABLE public.generated_images DROP CONSTRAINT IF EXISTS generated_images_inspire_template_consistency_check;
-- ALTER TABLE public.generated_images DROP CONSTRAINT IF EXISTS generated_images_override_target_check;
-- ALTER TABLE public.generated_images DROP COLUMN IF EXISTS override_target;
-- ALTER TABLE public.generated_images DROP COLUMN IF EXISTS style_template_id;
-- ALTER TABLE public.generated_images DROP CONSTRAINT IF EXISTS generated_images_generation_type_check;
-- ALTER TABLE public.generated_images ADD CONSTRAINT generated_images_generation_type_check
--   CHECK (generation_type IN ('coordinate','specified_coordinate','full_body','chibi','one_tap_style'));
-- DROP INDEX IF EXISTS public.idx_image_jobs_style_template_id;
-- ALTER TABLE public.image_jobs DROP CONSTRAINT IF EXISTS image_jobs_inspire_template_consistency_check;
-- ALTER TABLE public.image_jobs DROP CONSTRAINT IF EXISTS image_jobs_override_target_check;
-- ALTER TABLE public.image_jobs DROP COLUMN IF EXISTS override_target;
-- ALTER TABLE public.image_jobs DROP COLUMN IF EXISTS style_reference_image_url;
-- ALTER TABLE public.image_jobs DROP COLUMN IF EXISTS style_template_id;
-- ALTER TABLE public.image_jobs DROP CONSTRAINT IF EXISTS image_jobs_generation_type_check;
-- ALTER TABLE public.image_jobs ADD CONSTRAINT image_jobs_generation_type_check
--   CHECK (generation_type IN ('coordinate','specified_coordinate','full_body','chibi','one_tap_style'));
-- COMMIT;
-- ===============================================
