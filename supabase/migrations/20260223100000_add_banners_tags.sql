-- バナーにタグ機能を追加
ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

COMMENT ON COLUMN public.banners.tags IS 'バナー分類用タグ（例: イベント, キャンペーン）';
