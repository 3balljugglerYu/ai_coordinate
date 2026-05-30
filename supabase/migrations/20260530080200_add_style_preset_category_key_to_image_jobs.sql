-- image_jobs に preset_categories.key のスナップショットを追加する。
-- 設計判断は docs/planning/style-preset-raw-mode-implementation-plan.md ADR-006 参照。

ALTER TABLE public.image_jobs
  ADD COLUMN IF NOT EXISTS style_preset_category_key TEXT;

CREATE INDEX IF NOT EXISTS idx_image_jobs_style_preset_category_key
  ON public.image_jobs (style_preset_category_key)
  WHERE style_preset_category_key IS NOT NULL;

COMMENT ON COLUMN public.image_jobs.style_preset_category_key IS
  '生成時点の preset_categories.key スナップショット。後で category が rename/削除されても集計が連続する';
