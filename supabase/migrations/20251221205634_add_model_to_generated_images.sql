-- ===============================================
-- Add model column to generated_images
-- 画像生成に使用したモデル情報を保存するカラムを追加
-- ===============================================

-- modelカラムを追加
ALTER TABLE public.generated_images
ADD COLUMN IF NOT EXISTS model TEXT;

-- 既存レコードにデフォルト値を設定
UPDATE public.generated_images
SET model = 'gemini-2.5-flash-image'
WHERE model IS NULL;

-- CHECK制約を追加（許可される値: 'gemini-2.5-flash-image' または 'gemini-3-pro-image'）
ALTER TABLE public.generated_images
ADD CONSTRAINT generated_images_model_check
CHECK (model IS NULL OR model IN ('gemini-2.5-flash-image', 'gemini-3-pro-image'));

