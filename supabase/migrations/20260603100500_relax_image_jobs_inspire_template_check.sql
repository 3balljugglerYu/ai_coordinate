-- ===============================================
-- image_jobs.inspire_template_consistency_check を緩和
-- ===============================================
-- 背景:
--   user_style_templates.id に対する FK (image_jobs.style_template_id) は ON DELETE SET NULL。
--   テンプレートを削除すると参照側 image_jobs.style_template_id が NULL になるが、
--   既存 CHECK 制約 `(generation_type = 'inspire') = (style_template_id IS NOT NULL)` に
--   違反して DELETE が失敗していた。
--
-- 設計判断:
--   - 削除済テンプレを参照する過去 image_jobs は「生成記録としては残す」(= 消費者の生成履歴を保全)
--   - inspire 生成記録だが style_template_id=NULL (= 削除済テンプレ参照) のパターンを許容する
--   - INSERT 時の整合性 (= 新規 inspire 生成では style_template_id 必須) は API 層 (/api/generate-async handler)
--     で validate しているので DB 制約は不要
--
-- 緩和方針:
--   - CHECK 制約を削除 (= 過去の inspire jobs で style_template_id=NULL を許容)

BEGIN;

ALTER TABLE public.image_jobs
  DROP CONSTRAINT IF EXISTS image_jobs_inspire_template_consistency_check;

COMMENT ON COLUMN public.image_jobs.style_template_id IS
  'Inspire 生成時の参照テンプレ id。テンプレが削除された場合は ON DELETE SET NULL で NULL になる (= 過去生成記録としては残る)';

COMMIT;

-- ===============================================
-- DOWN: 制約を復元 (= 削除済テンプレを参照する row が無い前提)
-- BEGIN;
-- ALTER TABLE public.image_jobs
--   ADD CONSTRAINT image_jobs_inspire_template_consistency_check
--   CHECK ((generation_type = 'inspire') = (style_template_id IS NOT NULL));
-- COMMIT;
-- ===============================================
