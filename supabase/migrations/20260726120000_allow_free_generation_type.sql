-- ===============================================
-- じゆうモード(generationType="free") 対応:
-- image_jobs / generated_images の generation_type CHECK 制約に 'free' を追加する。
--
-- 運用メモ:
-- ADD CONSTRAINT CHECK は既存行を検査し、対象テーブルに短時間の ACCESS EXCLUSIVE
-- ロックを取得する。両テーブルとも generation_type は既存の許可値のみを持つため
-- 検査は成功する見込みだが、行数が多い場合はロック待ちが発生しうる。
-- ロック待ちで詰まらないよう lock_timeout を設定し、失敗時は時間をおいて再実行する。
-- (既存の許可値を狭めない「追加のみ」の変更なので後方互換)
-- ===============================================

SET lock_timeout = '5s';

BEGIN;

-- image_jobs.generation_type CHECK 拡張 ('free' 追加)
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
    'inspire',
    'free'
  )
);

-- generated_images.generation_type CHECK 拡張 ('free' 追加)
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
    'inspire',
    'free'
  )
);

COMMIT;

-- ロールバック方針(手動):
--   generation_type='free' の行が存在しない場合に限り、'free' を除いた許可値で
--   両制約を再作成すれば戻せる。'free' の行が既にある場合は制約縮小を行わないこと
--   (既存行が制約違反になるため)。
