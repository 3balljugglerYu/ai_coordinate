-- ===============================================
-- コレクション: 進捗リング中央に表示する「シリーズ用キャラ画像」
-- ===============================================
-- 運営(admin)がシリーズごとに設定する、名前なしのキャラ画像の保存パス。
-- ユーザーに表示するため generated-images(public)バケットに保存し、公開URLで配信する。
-- 進捗取得は RPC を変えず、取得側(server)で本カラムを結合して URL 化する。
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS collection_character_path TEXT;

COMMENT ON COLUMN public.preset_categories.collection_character_path IS
  '進捗リング中央に表示するシリーズ用キャラ画像(名前なし)の保存パス。generated-images バケット';

-- ===============================================
-- DOWN:
-- ALTER TABLE public.preset_categories DROP COLUMN IF EXISTS collection_character_path;
-- ===============================================
