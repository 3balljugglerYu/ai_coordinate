-- generated_imagesテーブルにWebP用のストレージパスカラムを追加
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS storage_path_display TEXT,
  ADD COLUMN IF NOT EXISTS storage_path_thumb TEXT;

-- コメント追加（オプション）
COMMENT ON COLUMN public.generated_images.storage_path_display IS 'WebP形式の表示用画像のストレージパス（長辺1280px）';
COMMENT ON COLUMN public.generated_images.storage_path_thumb IS 'WebP形式のサムネイル画像のストレージパス（幅640px）';
