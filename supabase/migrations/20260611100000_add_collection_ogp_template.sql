-- ===============================================
-- コレクション OGP テンプレート(カテゴリ別デザイン)
-- ===============================================
-- 「台紙をシェアする」で取得する公開ページ(/m/{id})の OGP 画像を、
-- カテゴリごとに用意したデザインテンプレート(1200x630 PNG)へ
-- 実物のコンプリート台紙を合成して生成できるようにする。
--
--   - ogp_template_path: private `collection-mount-templates` bucket 内の
--     1200x630 PNG path。NULL のときは従来の SVG 合成デザインで生成する
--   - ogp_mount_placement: テンプレート上に台紙を配置する位置・サイズ・回転
--     ({"cx":800,"cy":315,"width":366,"rotate":2.5} 形式)。NULL はコード側の
--     既定値を使う
--
-- 影響範囲: /api/collections/mount の OGP 生成のみ。台紙本体・進捗 UI には
-- 影響しない。
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS ogp_template_path TEXT,
  ADD COLUMN IF NOT EXISTS ogp_mount_placement JSONB;

COMMENT ON COLUMN public.preset_categories.ogp_template_path IS
  'コレクション OGP 用テンプレート(collection-mount-templates bucket の 1200x630 PNG path)。NULL=従来の SVG 合成デザイン';
COMMENT ON COLUMN public.preset_categories.ogp_mount_placement IS
  'OGP テンプレートへの台紙配置 {"cx","cy","width","rotate"}。NULL=コード側既定値';

-- ===============================================
-- DOWN:
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS ogp_template_path,
--   DROP COLUMN IF EXISTS ogp_mount_placement;
-- ===============================================
