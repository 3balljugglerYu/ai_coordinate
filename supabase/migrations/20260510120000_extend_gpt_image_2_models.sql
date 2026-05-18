-- Expand GPT Image 2 canonical model values to quality x size tiers.
-- Keep legacy 'gpt-image-2-low' allowed for historical rows and rollback safety.

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
  'gpt-image-2-low',
  'gpt-image-2-low-1k',
  'gpt-image-2-low-2k',
  'gpt-image-2-low-4k',
  'gpt-image-2-medium-1k',
  'gpt-image-2-medium-2k',
  'gpt-image-2-medium-4k',
  'gpt-image-2-high-1k',
  'gpt-image-2-high-2k',
  'gpt-image-2-high-4k'
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
  'gpt-image-2-low',
  'gpt-image-2-low-1k',
  'gpt-image-2-low-2k',
  'gpt-image-2-low-4k',
  'gpt-image-2-medium-1k',
  'gpt-image-2-medium-2k',
  'gpt-image-2-medium-4k',
  'gpt-image-2-high-1k',
  'gpt-image-2-high-2k',
  'gpt-image-2-high-4k'
));
