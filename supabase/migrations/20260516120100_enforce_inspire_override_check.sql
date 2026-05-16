-- Inspire の override 4 bool に対する CHECK 制約を追加する（段階移行の **第 2 段**）。
--
-- 前提:
--   - 第 1 段 migration (20260516120000_inspire_override_checkboxes.sql) で 4 カラム追加 +
--     既存データの 4 bool への変換は完了している
--   - Next.js (Vercel) と Edge Function (image-gen-worker) の両方で **新コード（overrides
--     ベース）が反映済み** であること
--
--   この migration をコード反映前に適用すると、旧 Next.js が generation_type='inspire' で
--   新カラム抜きの INSERT を投げて CHECK 違反になるので、必ずコード反映後に実行する。

ALTER TABLE public.image_jobs
  DROP CONSTRAINT IF EXISTS image_jobs_inspire_overrides_consistency_check;
ALTER TABLE public.image_jobs
  ADD CONSTRAINT image_jobs_inspire_overrides_consistency_check
  CHECK (
    (generation_type = 'inspire' AND
      override_outfit IS NOT NULL AND
      override_angle IS NOT NULL AND
      override_pose IS NOT NULL AND
      override_background IS NOT NULL AND
      (override_outfit OR override_angle OR override_pose OR override_background))
    OR
    (generation_type <> 'inspire' AND
      override_outfit IS NULL AND
      override_angle IS NULL AND
      override_pose IS NULL AND
      override_background IS NULL)
  );

ALTER TABLE public.generated_images
  DROP CONSTRAINT IF EXISTS generated_images_inspire_overrides_consistency_check;
ALTER TABLE public.generated_images
  ADD CONSTRAINT generated_images_inspire_overrides_consistency_check
  CHECK (
    (generation_type = 'inspire' AND
      override_outfit IS NOT NULL AND
      override_angle IS NOT NULL AND
      override_pose IS NOT NULL AND
      override_background IS NOT NULL AND
      (override_outfit OR override_angle OR override_pose OR override_background))
    OR
    (generation_type <> 'inspire' AND
      override_outfit IS NULL AND
      override_angle IS NULL AND
      override_pose IS NULL AND
      override_background IS NULL)
  );
