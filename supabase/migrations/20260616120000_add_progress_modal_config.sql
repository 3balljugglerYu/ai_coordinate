-- ===============================================
-- preset_categories に「進捗モーダル(CollectionProgressModal)のカスタム定義」を追加
-- ===============================================
-- 運営が進捗モーダルの土台フレーム画像・スロット(6枠)・ボタン領域を
-- カテゴリごとに調整できるようにする。台紙(mount_*)の admin 設定と対の関係。
--
-- - progress_modal_frame_path   : モーダル土台フレーム画像の保存パス
--                                 (public バケット generated-images 配下)。
--                                 値があればコード側 MODAL_LAYOUTS(god/wafer)より
--                                 優先してモーダル描画に使う。NULL なら従来どおり
--                                 ハードコード MODAL_LAYOUTS にフォールバック。
-- - progress_modal_frame_width  : フレーム画像の実寸(px)。表示アスペクト導出に使う。
-- - progress_modal_frame_height : 同上。
-- - progress_modal_slots        : シール枠の正規化矩形配列 [{x,y,w,h}] (0..1)。
-- - progress_modal_button       : 「台紙を作成する」ボタン領域の正規化矩形 {x,y,w,h} (0..1)。
--
-- すべて nullable。既存カテゴリ(神コレ/ウエハース等)は
-- progress_modal_frame_path=NULL のまま動作不変(厳密な no-op)。
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS progress_modal_frame_path TEXT,
  ADD COLUMN IF NOT EXISTS progress_modal_frame_width INTEGER,
  ADD COLUMN IF NOT EXISTS progress_modal_frame_height INTEGER,
  ADD COLUMN IF NOT EXISTS progress_modal_slots JSONB,
  ADD COLUMN IF NOT EXISTS progress_modal_button JSONB;

-- フレーム実寸は正の整数のみ(NULL 可)
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_dimensions_positive;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_progress_modal_dimensions_positive
  CHECK (
    (progress_modal_frame_width IS NULL OR progress_modal_frame_width > 0)
    AND (progress_modal_frame_height IS NULL OR progress_modal_frame_height > 0)
  );

-- スロットは JSON 配列のみ(要素の中身検証は API 層で行う)
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_slots_is_array;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_progress_modal_slots_is_array
  CHECK (progress_modal_slots IS NULL OR jsonb_typeof(progress_modal_slots) = 'array');

-- ボタン領域は JSON オブジェクトのみ(要素の中身検証は API 層で行う)
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_button_is_object;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_progress_modal_button_is_object
  CHECK (progress_modal_button IS NULL OR jsonb_typeof(progress_modal_button) = 'object');

COMMENT ON COLUMN public.preset_categories.progress_modal_frame_path IS '進捗モーダルの土台フレーム画像パス(public バケット generated-images 配下)。NULL なら MODAL_LAYOUTS にフォールバック';
COMMENT ON COLUMN public.preset_categories.progress_modal_frame_width IS '進捗モーダルフレーム画像の実寸(px)。表示アスペクト導出に使用';
COMMENT ON COLUMN public.preset_categories.progress_modal_frame_height IS '進捗モーダルフレーム画像の実寸(px)。表示アスペクト導出に使用';
COMMENT ON COLUMN public.preset_categories.progress_modal_slots IS '進捗モーダルのシール枠の正規化矩形配列 [{x,y,w,h}] (0..1)';
COMMENT ON COLUMN public.preset_categories.progress_modal_button IS '進捗モーダルのボタン領域の正規化矩形 {x,y,w,h} (0..1)';

-- ===============================================
-- DOWN:
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_button_is_object,
--   DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_slots_is_array,
--   DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_dimensions_positive;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS progress_modal_button,
--   DROP COLUMN IF EXISTS progress_modal_slots,
--   DROP COLUMN IF EXISTS progress_modal_frame_height,
--   DROP COLUMN IF EXISTS progress_modal_frame_width,
--   DROP COLUMN IF EXISTS progress_modal_frame_path;
-- ===============================================
