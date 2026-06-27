-- コレクション「めくれる日記帳(book)」表示のための列追加。
-- 対象: travel_to_italy(9:16縦長×8枚のスクラップブック)を、単一台紙ではなく
--   1枚ずつめくれる本として完走表示・シェアするため。
--
-- 本マイグレーションは「列追加のみ」(追加的・後方互換)。
-- travel_to_italy を実際にコレクション化(is_collection_series=true / completion_threshold=8 /
--   completion_view_mode='book' / book_cover_path / ogp_template_path 設定)するのは、
--   本UI・サーバ処理が揃った go-live 時に別途データ更新で行う(半完成状態で完走が動き出さないため)。
-- 注: 適用は最終確認のうえ一緒に実施する。

BEGIN;

-- 完走表示モード: 'mount'(従来の単一台紙) / 'book'(めくれる日記帳)。既定は mount で既存挙動を維持。
ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS completion_view_mode TEXT NOT NULL DEFAULT 'mount';

ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_completion_view_mode_check;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_completion_view_mode_check
  CHECK (completion_view_mode IN ('mount', 'book'));

-- book 表示の表紙(0ページ目)画像。カタログのキャンペーン表紙(cover_storage_path)と同じ考え方。
ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS book_cover_path TEXT;

-- 完走時に採用した各ページ画像 storage_path のスナップショット(book モード用)。
-- 自動選択(各Day最新1枚)または選択UIで確定した順序付き配列を保存し、シェア後も内容を固定する。
ALTER TABLE public.collection_completions
  ADD COLUMN IF NOT EXISTS book_page_paths JSONB;

-- 配列(または NULL)のみ許可(多層防御。アプリ側でも防御的にフィルタする)。
ALTER TABLE public.collection_completions
  DROP CONSTRAINT IF EXISTS collection_completions_book_page_paths_check;
ALTER TABLE public.collection_completions
  ADD CONSTRAINT collection_completions_book_page_paths_check
  CHECK (book_page_paths IS NULL OR jsonb_typeof(book_page_paths) = 'array');

COMMENT ON COLUMN public.preset_categories.completion_view_mode IS
  '完走表示モード: mount(単一台紙) / book(めくれる日記帳)。既定 mount。';
COMMENT ON COLUMN public.preset_categories.book_cover_path IS
  'book 表示の表紙(0ページ目)画像の storage path。実行時/admin は generated-images(public) を使用。未設定時は簡易表紙。';
COMMENT ON COLUMN public.collection_completions.book_page_paths IS
  'book 表示で採用した各ページ画像 storage_path(generated-images)の順序付き配列(スナップショット)。';

COMMIT;
