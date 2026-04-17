-- Allow one_tap_style generation records in async job and saved image tables.

ALTER TABLE public.image_jobs
DROP CONSTRAINT IF EXISTS image_jobs_generation_type_check;

ALTER TABLE public.image_jobs
ADD CONSTRAINT image_jobs_generation_type_check
CHECK (
  generation_type IN (
    'coordinate',
    'specified_coordinate',
    'full_body',
    'chibi',
    'one_tap_style'
  )
);

ALTER TABLE public.generated_images
DROP CONSTRAINT IF EXISTS generated_images_generation_type_check;

ALTER TABLE public.generated_images
ADD CONSTRAINT generated_images_generation_type_check
CHECK (
  generation_type IN (
    'coordinate',
    'specified_coordinate',
    'full_body',
    'chibi',
    'one_tap_style'
  )
);
