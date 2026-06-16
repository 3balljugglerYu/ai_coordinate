-- ===============================================
-- preset_categories に「進捗モーダル中央画像の位置」を追加
-- ===============================================
-- 20260616120000 でフレーム/スロット/ボタンを admin から設定できるようにしたのに続き、
-- DB 駆動(ぷち神等)のレイアウトで「中央画像の位置」もカテゴリごとに調整できるようにする。
--
-- - progress_modal_center : 中央画像の正規化矩形 {x,y,w,h} (0..1)。
--                           中央に表示する画像は既存の collection_character_path
--                           (= characterImageUrl)を流用する。位置だけをここで持つ。
--
-- nullable。既存カテゴリ(神コレ/ウエハース/coordinate 等)は
-- progress_modal_center=NULL のまま動作不変(厳密な no-op)。
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS progress_modal_center JSONB;

-- 中央画像領域は JSON オブジェクトのみ(要素の中身検証は API 層で行う)
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_center_is_object;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_progress_modal_center_is_object
  CHECK (progress_modal_center IS NULL OR jsonb_typeof(progress_modal_center) = 'object');

COMMENT ON COLUMN public.preset_categories.progress_modal_center IS '進捗モーダルの中央画像領域の正規化矩形 {x,y,w,h} (0..1)。表示画像は collection_character_path を流用';

-- ===============================================
-- DOWN:
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_center_is_object;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS progress_modal_center;
-- ===============================================
