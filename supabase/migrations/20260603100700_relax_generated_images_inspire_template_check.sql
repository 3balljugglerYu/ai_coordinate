-- ===============================================
-- generated_images.inspire_template_consistency_check も同様に緩和
-- ===============================================
-- 背景:
--   20260603100500 で image_jobs 側の同 CHECK 制約を削除して
--   user_style_templates を削除可能化したが、generated_images 側にも
--   同じパターンの CHECK 制約があり、template 削除 → SET NULL 後の
--   inspire 生成画像で違反するため、引き続き DELETE が失敗していた。
--
-- 設計判断:
--   image_jobs と同様の理由:
--   - 削除済テンプレを参照する過去 generated_images は「生成画像としては残す」
--     (= 消費者のマイページ生成履歴を保全)
--   - INSERT 時の整合性は API 層 (/api/generate-async + image-gen-worker) で
--     validate しているため DB 制約は不要

BEGIN;

ALTER TABLE public.generated_images
  DROP CONSTRAINT IF EXISTS generated_images_inspire_template_consistency_check;

COMMENT ON COLUMN public.generated_images.style_template_id IS
  'Inspire 生成時の参照テンプレ id。テンプレが削除された場合は ON DELETE SET NULL で NULL になる (= 過去生成画像としては残る)';

COMMIT;

-- ===============================================
-- DOWN: 制約を復元 (= 削除済テンプレを参照する row が無い前提)
-- BEGIN;
-- ALTER TABLE public.generated_images
--   ADD CONSTRAINT generated_images_inspire_template_consistency_check
--   CHECK ((generation_type = 'inspire') = (style_template_id IS NOT NULL));
-- COMMIT;
-- ===============================================
