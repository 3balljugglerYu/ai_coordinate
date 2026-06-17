-- ===============================================
-- preset_categories に「解放お知らせモーダル(PetitUnlockAnnouncer)のカスタム定義」を追加
-- ===============================================
-- 進捗モーダル(progress_modal_*)を admin から DB 駆動化したのと同様に、
-- 解放ゲート付きカテゴリ(例: ぷち神)の「解放お知らせ」モーダルの
-- ヒーロー画像・本文・アクセント色を、カテゴリごとに admin が指定できるようにする。
--
-- - unlock_announcement_hero_path         : 初回解放モーダルのヒーロー画像パス
--                                           (public バケット generated-images 配下)。
--                                           値があればコード側の固定画像
--                                           /collections/petit-unlock-hero.png より優先。
--                                           NULL なら従来どおり固定画像にフォールバック。
-- - unlock_announcement_initial_body      : 初回モーダルの本文。NULL なら現行ハードコード文。
-- - unlock_announcement_drip_body         : 段階解放モーダルの本文。NULL なら現行ハードコード文。
-- - unlock_announcement_accent_color      : ボタン背景/アクセント色。#RRGGBB。NULL=#C670FF。
-- - unlock_announcement_accent_hover_color: ボタン hover 色。#RRGGBB。NULL=#B14DF0。
-- - unlock_announcement_title_color       : 見出し文字色。#RRGGBB。NULL=#8B3DC9。
-- - unlock_announcement_soft_color        : NEW ピル/淡い面の背景色。#RRGGBB。NULL=#F3E0FF。
--
-- すべて nullable。既存カテゴリ・未設定の petit は全列 NULL のまま動作不変(厳密な no-op)。
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS unlock_announcement_hero_path TEXT,
  ADD COLUMN IF NOT EXISTS unlock_announcement_initial_body TEXT,
  ADD COLUMN IF NOT EXISTS unlock_announcement_drip_body TEXT,
  ADD COLUMN IF NOT EXISTS unlock_announcement_accent_color TEXT,
  ADD COLUMN IF NOT EXISTS unlock_announcement_accent_hover_color TEXT,
  ADD COLUMN IF NOT EXISTS unlock_announcement_title_color TEXT,
  ADD COLUMN IF NOT EXISTS unlock_announcement_soft_color TEXT;

-- 本文は暴走入力を避けるため 200 文字以内(NULL 可)
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_unlock_announcement_body_length;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_unlock_announcement_body_length
  CHECK (
    (unlock_announcement_initial_body IS NULL OR char_length(unlock_announcement_initial_body) <= 200)
    AND (unlock_announcement_drip_body IS NULL OR char_length(unlock_announcement_drip_body) <= 200)
  );

-- 色 4 列は NULL もしくは #RRGGBB 形式の16進カラーのみ許可する
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_unlock_announcement_colors_hex;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_unlock_announcement_colors_hex
  CHECK (
    (unlock_announcement_accent_color IS NULL OR unlock_announcement_accent_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (unlock_announcement_accent_hover_color IS NULL OR unlock_announcement_accent_hover_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (unlock_announcement_title_color IS NULL OR unlock_announcement_title_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (unlock_announcement_soft_color IS NULL OR unlock_announcement_soft_color ~ '^#[0-9A-Fa-f]{6}$')
  );

COMMENT ON COLUMN public.preset_categories.unlock_announcement_hero_path IS '解放お知らせ初回モーダルのヒーロー画像パス(public バケット generated-images 配下)。NULL なら /collections/petit-unlock-hero.png にフォールバック';
COMMENT ON COLUMN public.preset_categories.unlock_announcement_initial_body IS '解放お知らせ初回モーダルの本文。NULL なら現行ハードコード文';
COMMENT ON COLUMN public.preset_categories.unlock_announcement_drip_body IS '解放お知らせ段階解放モーダルの本文。NULL なら現行ハードコード文';
COMMENT ON COLUMN public.preset_categories.unlock_announcement_accent_color IS '解放お知らせのボタン/アクセント色。#RRGGBB。NULL=#C670FF';
COMMENT ON COLUMN public.preset_categories.unlock_announcement_accent_hover_color IS '解放お知らせのボタン hover 色。#RRGGBB。NULL=#B14DF0';
COMMENT ON COLUMN public.preset_categories.unlock_announcement_title_color IS '解放お知らせの見出し文字色。#RRGGBB。NULL=#8B3DC9';
COMMENT ON COLUMN public.preset_categories.unlock_announcement_soft_color IS '解放お知らせの NEW ピル/淡い面の背景色。#RRGGBB。NULL=#F3E0FF';

-- ===============================================
-- DOWN:
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_unlock_announcement_colors_hex,
--   DROP CONSTRAINT IF EXISTS preset_categories_unlock_announcement_body_length;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS unlock_announcement_soft_color,
--   DROP COLUMN IF EXISTS unlock_announcement_title_color,
--   DROP COLUMN IF EXISTS unlock_announcement_accent_hover_color,
--   DROP COLUMN IF EXISTS unlock_announcement_accent_color,
--   DROP COLUMN IF EXISTS unlock_announcement_drip_body,
--   DROP COLUMN IF EXISTS unlock_announcement_initial_body,
--   DROP COLUMN IF EXISTS unlock_announcement_hero_path;
-- ===============================================
