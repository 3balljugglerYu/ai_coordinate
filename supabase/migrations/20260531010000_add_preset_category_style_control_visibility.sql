-- preset_categories に /style 画面のカテゴリ別 UI 表示制御を追加する。
-- 既存カテゴリは全項目表示を default とし、chibi は source_image_type を使わないため初期非表示にする。

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS show_source_image_type_control BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_background_change_control BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_generation_model_control BOOLEAN NOT NULL DEFAULT true;

UPDATE public.preset_categories
SET show_source_image_type_control = false
WHERE key = 'chibi';

COMMENT ON COLUMN public.preset_categories.show_source_image_type_control IS
  '/style 画面でアップロード画像のタイプ選択を表示するか';
COMMENT ON COLUMN public.preset_categories.show_background_change_control IS
  '/style 画面で背景変更設定を表示するか';
COMMENT ON COLUMN public.preset_categories.show_generation_model_control IS
  '/style 画面で生成モデル選択を表示するか';
