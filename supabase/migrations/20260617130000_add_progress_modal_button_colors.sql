-- ===============================================
-- preset_categories に「進捗モーダルの CTA ボタン配色」を追加
-- ===============================================
-- 進捗モーダル(CollectionProgressModal)の下部 CTA ボタンは、これまで DB 駆動台座
-- (progress_modal_frame_path 設定時)ではフレーム画像にボタン文言を焼き込み、コード側は
-- 透明クリック領域だけにしていた。そのため「コンプリート後にシート作成/更新へ文言を
-- 変える」ことができなかった。
--
-- 本マイグレーションで、進捗リング色(progress_modal_ring_color)と同じく
-- ボタンの「塗り色」と「文字色」を admin がカテゴリごとに指定できるようにする。
-- コード側はこの色で CTA ボタンを描画し、状態(達成前/達成後/作成後)に応じて文言を出し分ける。
--
-- - progress_modal_button_color      : CTA ボタンの塗り色。#RRGGBB。NULL=従来のオレンジ。
-- - progress_modal_button_text_color : CTA ボタンの文字色。#RRGGBB。NULL=白(#FFFFFF)。
--
-- どちらも nullable。NULL のときは従来配色(オレンジ地/白文字)を使う。
-- 既存カテゴリ・未設定カテゴリは NULL のまま動作不変(厳密な no-op)。
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS progress_modal_button_color TEXT,
  ADD COLUMN IF NOT EXISTS progress_modal_button_text_color TEXT;

-- 値は NULL もしくは #RRGGBB 形式の16進カラーのみ許可する
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_button_colors_hex;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_progress_modal_button_colors_hex
  CHECK (
    (progress_modal_button_color IS NULL OR progress_modal_button_color ~ '^#[0-9A-Fa-f]{6}$')
    AND (progress_modal_button_text_color IS NULL OR progress_modal_button_text_color ~ '^#[0-9A-Fa-f]{6}$')
  );

COMMENT ON COLUMN public.preset_categories.progress_modal_button_color IS '進捗モーダルCTAボタンの塗り色。#RRGGBB。NULL=従来のオレンジ';
COMMENT ON COLUMN public.preset_categories.progress_modal_button_text_color IS '進捗モーダルCTAボタンの文字色。#RRGGBB。NULL=白(#FFFFFF)';

-- ===============================================
-- DOWN:
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_progress_modal_button_colors_hex;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS progress_modal_button_text_color,
--   DROP COLUMN IF EXISTS progress_modal_button_color;
-- ===============================================
