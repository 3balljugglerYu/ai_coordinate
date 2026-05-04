-- generated_images テーブルに「Before（生成元）画像」の永続パス列を追加
-- 投稿時にユーザーが「Beforeも公開する」を選択した場合のみ書き込まれる。
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS pre_generation_storage_path TEXT;

COMMENT ON COLUMN public.generated_images.pre_generation_storage_path IS
  '生成元画像 (Before) の WebP 永続パス。形式: {user_id}/pre-generation/{generated_image_id}_display.webp。投稿時にユーザーが「Beforeも公開する」を選択した場合のみ設定される。';
