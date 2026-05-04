-- generated_images テーブルに「Before（生成元）画像」の永続パス列を追加。
-- 生成完了時に image-gen-worker が
-- /api/internal/generated-images/persist-before-image を fire-and-forget で叩き、
-- 内部 API が WebP 化してこの列にパスを書き込む（バックグラウンド処理）。
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS pre_generation_storage_path TEXT;

COMMENT ON COLUMN public.generated_images.pre_generation_storage_path IS
  '生成元画像 (Before) の WebP 永続パス。形式: {user_id}/pre-generation/{generated_image_id}_display.webp。生成完了時に worker → 内部 API 経由でバックグラウンド永続化される。NULL の間は image_jobs.input_image_url を楽観表示のフォールバックとして使う。';
