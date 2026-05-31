-- preset_categories に出力比率設定とユーザー向け説明を追加する。
-- 既存カテゴリは source (= 従来通りアップロード画像比率) を default とし、
-- chibi は運用意図に合わせて square にする。

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS output_aspect_ratio_mode TEXT NOT NULL DEFAULT 'source'
    CHECK (output_aspect_ratio_mode IN ('source', 'square')),
  ADD COLUMN IF NOT EXISTS user_guidance_ja TEXT NULL
    CHECK (user_guidance_ja IS NULL OR char_length(user_guidance_ja) <= 1000),
  ADD COLUMN IF NOT EXISTS user_guidance_en TEXT NULL
    CHECK (user_guidance_en IS NULL OR char_length(user_guidance_en) <= 1000);

UPDATE public.preset_categories
SET output_aspect_ratio_mode = 'square'
WHERE key = 'chibi';

COMMENT ON COLUMN public.preset_categories.output_aspect_ratio_mode IS
  'source = ユーザーのアップロード画像比率に合わせる / square = 1:1 正方形固定';
COMMENT ON COLUMN public.preset_categories.user_guidance_ja IS
  'ユーザーに表示する推奨画像・注意事項などの説明文 (日本語)';
COMMENT ON COLUMN public.preset_categories.user_guidance_en IS
  'ユーザーに表示する推奨画像・注意事項などの説明文 (English)';
