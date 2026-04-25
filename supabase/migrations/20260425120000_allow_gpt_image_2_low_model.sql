-- Coordinate screen model update:
-- allow OpenAI gpt-image-2 (quality=low) alongside existing Gemini models

ALTER TABLE public.generated_images
DROP CONSTRAINT IF EXISTS generated_images_model_check;

ALTER TABLE public.generated_images
ADD CONSTRAINT generated_images_model_check
CHECK (model IS NULL OR model IN (
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview-512',
  'gemini-3.1-flash-image-preview-1024',
  'gemini-3-pro-image-1k',
  'gemini-3-pro-image-2k',
  'gemini-3-pro-image-4k',
  'gpt-image-2-low'
));

ALTER TABLE public.image_jobs
DROP CONSTRAINT IF EXISTS image_jobs_model_check;

ALTER TABLE public.image_jobs
ADD CONSTRAINT image_jobs_model_check
CHECK (model IS NULL OR model IN (
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview-512',
  'gemini-3.1-flash-image-preview-1024',
  'gemini-3-pro-image-1k',
  'gemini-3-pro-image-2k',
  'gemini-3-pro-image-4k',
  'gpt-image-2-low'
));
