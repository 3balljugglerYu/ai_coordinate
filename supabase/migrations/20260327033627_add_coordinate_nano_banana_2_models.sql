-- Coordinate screen model update:
-- keep historical gemini-2.5 rows readable while allowing Nano Banana 2 0.5K/1K

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
  'gemini-3-pro-image-4k'
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
  'gemini-3-pro-image-4k'
));
