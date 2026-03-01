-- CHECK制約を一時的に削除
ALTER TABLE public.generated_images
DROP CONSTRAINT IF EXISTS generated_images_model_check;

-- 既存の'gemini-3-pro-image'を'gemini-3-pro-image-2k'に更新（後方互換性）
UPDATE public.generated_images
SET model = 'gemini-3-pro-image-2k'
WHERE model = 'gemini-3-pro-image';

-- CHECK制約を更新して4つのモデル名を許可
ALTER TABLE public.generated_images
ADD CONSTRAINT generated_images_model_check
CHECK (model IS NULL OR model IN (
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-1k',
  'gemini-3-pro-image-2k',
  'gemini-3-pro-image-4k'
));

