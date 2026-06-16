-- ===============================================
-- preset_categories に「%達成バッジの文字色/背景色」を追加
-- ===============================================
-- 20260616160000 で進捗モーダルの「進捗リングの色」と「%達成バッジの色」を
-- admin から設定できるようにしたのに続き、バッジ内部の
-- 「文字色(% の数字・達成！ラベル)」と「背景色(内側スカロップ)」も
-- カテゴリごとに admin が指定できるようにする。
--
-- - progress_modal_badge_text_color : %達成バッジの文字色(% の数字・達成！）。#RRGGBB。
-- - progress_modal_badge_bg_color   : %達成バッジの内側背景色(クリーム地)。#RRGGBB。
--
-- どちらも nullable。NULL のときは従来どおりのデフォルト配色
-- (% はオレンジ #F97316 / 達成！は #B45309 / 背景はクリームの url(#badgeFill))を使う。
-- 既存カテゴリ(神コレ/ウエハース/coordinate 等)や未設定の petit は NULL のまま
-- 動作不変(厳密な no-op)。
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS progress_modal_badge_text_color TEXT;

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS progress_modal_badge_bg_color TEXT;

-- 値は NULL もしくは #RRGGBB 形式の16進カラーのみ許可する
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_badge_text_color_hex;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_progress_modal_badge_text_color_hex
  CHECK (
    progress_modal_badge_text_color IS NULL
    OR progress_modal_badge_text_color ~ '^#[0-9A-Fa-f]{6}$'
  );

ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_badge_bg_color_hex;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_progress_modal_badge_bg_color_hex
  CHECK (
    progress_modal_badge_bg_color IS NULL
    OR progress_modal_badge_bg_color ~ '^#[0-9A-Fa-f]{6}$'
  );

COMMENT ON COLUMN public.preset_categories.progress_modal_badge_text_color IS '進捗モーダルの%達成バッジの文字色(%の数字・達成！）。#RRGGBB。NULL=従来デフォルト配色';
COMMENT ON COLUMN public.preset_categories.progress_modal_badge_bg_color IS '進捗モーダルの%達成バッジの内側背景色(クリーム地)。#RRGGBB。NULL=従来デフォルト配色';

-- ===============================================
-- DOWN:
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_badge_text_color_hex;
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_badge_bg_color_hex;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS progress_modal_badge_text_color;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS progress_modal_badge_bg_color;
-- ===============================================
