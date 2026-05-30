-- style_presets に category_id / image_input_mode / reference_image_* を追加し、
-- 既存 preset を 'coordinate' カテゴリに backfill する。
-- 設計判断は docs/planning/style-preset-raw-mode-implementation-plan.md ADR-003, ADR-007 参照。

ALTER TABLE public.style_presets
  ADD COLUMN IF NOT EXISTS category_id UUID
    REFERENCES public.preset_categories(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS image_input_mode TEXT
    CHECK (image_input_mode IS NULL OR image_input_mode IN ('single', 'dual')),
  ADD COLUMN IF NOT EXISTS reference_image_url TEXT,
  ADD COLUMN IF NOT EXISTS reference_image_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS reference_image_width INTEGER
    CHECK (reference_image_width IS NULL OR reference_image_width > 0),
  ADD COLUMN IF NOT EXISTS reference_image_height INTEGER
    CHECK (reference_image_height IS NULL OR reference_image_height > 0);

-- 既存 preset を 'coordinate' カテゴリ + single モードに backfill
UPDATE public.style_presets
SET
  category_id = (SELECT id FROM public.preset_categories WHERE key = 'coordinate'),
  image_input_mode = 'single'
WHERE category_id IS NULL OR image_input_mode IS NULL;

-- NOT NULL 化 + dual 整合性 CHECK
ALTER TABLE public.style_presets
  ALTER COLUMN category_id SET NOT NULL,
  ALTER COLUMN image_input_mode SET NOT NULL;

ALTER TABLE public.style_presets
  DROP CONSTRAINT IF EXISTS style_presets_dual_requires_reference;
ALTER TABLE public.style_presets
  ADD CONSTRAINT style_presets_dual_requires_reference
  CHECK (
    image_input_mode = 'single'
    OR (
      image_input_mode = 'dual'
      AND reference_image_storage_path IS NOT NULL
      AND reference_image_url IS NOT NULL
    )
  );

-- category 別の表示順インデックス (公開一覧の JOIN 用)
CREATE INDEX IF NOT EXISTS idx_style_presets_category_published
  ON public.style_presets (category_id, sort_order)
  WHERE status = 'published';

COMMENT ON COLUMN public.style_presets.category_id IS '紐づく preset_categories. NOT NULL + ON DELETE RESTRICT で物理削除を防ぐ';
COMMENT ON COLUMN public.style_presets.image_input_mode IS 'single = image_0 のみ / dual = image_0 + preset の参考画像 (image_1)';
COMMENT ON COLUMN public.style_presets.reference_image_storage_path IS 'style_presets bucket 配下の参考画像 path。dual モードのみ必須';
COMMENT ON COLUMN public.style_presets.reference_image_url IS '参考画像の公開 URL (storage path から生成。表示・worker download 用)';
