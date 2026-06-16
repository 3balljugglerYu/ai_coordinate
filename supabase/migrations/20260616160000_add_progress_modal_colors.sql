-- ===============================================
-- preset_categories に「進捗モーダルの配色(リング/バッジ)」を追加
-- ===============================================
-- 20260616130000 で中央画像位置(progress_modal_center)を admin から設定できるように
-- したのに続き、進捗モーダルの「進捗リングの色」と「%達成バッジの色」も
-- カテゴリごとに admin が指定できるようにする。
--
-- - progress_modal_ring_color  : 進捗リング(アーク)の色。#RRGGBB の16進文字列。
-- - progress_modal_badge_color : %達成バッジの色。#RRGGBB の16進文字列。
--
-- どちらも nullable。NULL のときは従来どおりのデフォルト配色
-- (オレンジのリング/ゴールドのバッジ)を使う。既存カテゴリ(神コレ/ウエハース/
-- coordinate 等)や未設定の petit は NULL のまま動作不変(厳密な no-op)。
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS progress_modal_ring_color TEXT;

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS progress_modal_badge_color TEXT;

-- 値は NULL もしくは #RRGGBB 形式の16進カラーのみ許可する
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_ring_color_hex;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_progress_modal_ring_color_hex
  CHECK (
    progress_modal_ring_color IS NULL
    OR progress_modal_ring_color ~ '^#[0-9A-Fa-f]{6}$'
  );

ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_badge_color_hex;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_progress_modal_badge_color_hex
  CHECK (
    progress_modal_badge_color IS NULL
    OR progress_modal_badge_color ~ '^#[0-9A-Fa-f]{6}$'
  );

COMMENT ON COLUMN public.preset_categories.progress_modal_ring_color IS '進捗モーダルの進捗リング(アーク)の色。#RRGGBB。NULL=従来デフォルト配色';
COMMENT ON COLUMN public.preset_categories.progress_modal_badge_color IS '進捗モーダルの%達成バッジの色。#RRGGBB。NULL=従来デフォルト配色';

-- ===============================================
-- DOWN:
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_ring_color_hex;
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_badge_color_hex;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS progress_modal_ring_color;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS progress_modal_badge_color;
-- ===============================================
