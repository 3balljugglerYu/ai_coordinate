-- OpenAI Images Edit API の n 指定に対応するため、1 image_jobs 行から
-- 複数 generated_images 行を安全に紐づけられるようにする。

ALTER TABLE public.image_jobs
  ADD COLUMN IF NOT EXISTS requested_image_count integer NOT NULL DEFAULT 1;

ALTER TABLE public.image_jobs
  DROP CONSTRAINT IF EXISTS image_jobs_requested_image_count_check;

ALTER TABLE public.image_jobs
  ADD CONSTRAINT image_jobs_requested_image_count_check
  CHECK (requested_image_count BETWEEN 1 AND 4);

COMMENT ON COLUMN public.image_jobs.requested_image_count IS
  'この job が要求した生成枚数。OpenAI batched edit では 1 job で複数 generated_images を作る。';

ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS image_job_id uuid NULL
    REFERENCES public.image_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_job_result_index integer NULL;

ALTER TABLE public.generated_images
  DROP CONSTRAINT IF EXISTS generated_images_image_job_result_index_check;

ALTER TABLE public.generated_images
  ADD CONSTRAINT generated_images_image_job_result_index_check
  CHECK (image_job_result_index IS NULL OR image_job_result_index >= 0);

COMMENT ON COLUMN public.generated_images.image_job_id IS
  'この画像を生成した image_jobs.id。OpenAI batched edit の複数結果取得に使う。';

COMMENT ON COLUMN public.generated_images.image_job_result_index IS
  '同一 image_job_id 内の結果順。OpenAI response data 配列順を 0 始まりで保持する。';

CREATE INDEX IF NOT EXISTS idx_generated_images_image_job_id
  ON public.generated_images (image_job_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_images_job_result_unique
  ON public.generated_images (image_job_id, image_job_result_index)
  WHERE image_job_id IS NOT NULL
    AND image_job_result_index IS NOT NULL;

CREATE OR REPLACE FUNCTION public.complete_image_job_with_generated_images(
  p_job_id uuid,
  p_images jsonb,
  p_generation_metadata jsonb DEFAULT NULL::jsonb,
  p_result_image_url text DEFAULT NULL::text
)
RETURNS TABLE (
  id uuid,
  image_url text,
  storage_path text,
  image_job_result_index integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.image_jobs%ROWTYPE;
  v_expected_count integer;
  v_image_count integer;
  v_image jsonb;
  v_index integer := 0;
  v_image_url text;
  v_storage_path text;
  v_inserted_id uuid;
  v_first_image_id uuid;
  v_first_image_url text;
BEGIN
  IF p_images IS NULL OR jsonb_typeof(p_images) <> 'array' THEN
    RAISE EXCEPTION 'p_images must be a JSON array';
  END IF;

  SELECT *
  INTO v_job
  FROM public.image_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'image job not found: %', p_job_id;
  END IF;

  IF v_job.status = 'succeeded' THEN
    RETURN QUERY
    SELECT
      gi.id,
      gi.image_url,
      gi.storage_path,
      gi.image_job_result_index
    FROM public.generated_images AS gi
    WHERE gi.image_job_id = p_job_id
    ORDER BY gi.image_job_result_index ASC NULLS LAST, gi.created_at ASC;
    RETURN;
  END IF;

  IF v_job.status <> 'processing' THEN
    RAISE EXCEPTION 'image job must be processing to complete: %, status=%', p_job_id, v_job.status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.generated_images AS gi
    WHERE gi.image_job_id = p_job_id
  ) THEN
    -- This RPC is currently used only by OpenAI batched coordinate jobs.
    -- Gemini's existing path leaves image_job_id NULL, so it must not be
    -- switched to this RPC until that path also writes per-job result indexes.
    RAISE EXCEPTION 'generated images already exist for job: %', p_job_id;
  END IF;

  v_expected_count := COALESCE(v_job.requested_image_count, 1);
  v_image_count := jsonb_array_length(p_images);

  IF v_image_count <> v_expected_count THEN
    RAISE EXCEPTION 'generated image count mismatch for job %, expected %, got %',
      p_job_id,
      v_expected_count,
      v_image_count;
  END IF;

  FOR v_image IN
    SELECT element
    FROM jsonb_array_elements(p_images) AS elements(element)
  LOOP
    v_image_url := NULLIF(TRIM(v_image->>'image_url'), '');
    v_storage_path := NULLIF(TRIM(v_image->>'storage_path'), '');

    IF v_image_url IS NULL THEN
      RAISE EXCEPTION 'image_url is required for job %, index %', p_job_id, v_index;
    END IF;

    IF v_storage_path IS NULL THEN
      RAISE EXCEPTION 'storage_path is required for job %, index %', p_job_id, v_index;
    END IF;

    INSERT INTO public.generated_images AS gi (
      user_id,
      image_url,
      storage_path,
      prompt,
      background_mode,
      is_posted,
      generation_type,
      generation_metadata,
      model,
      source_image_stock_id,
      image_job_id,
      image_job_result_index
    )
    VALUES (
      v_job.user_id,
      v_image_url,
      v_storage_path,
      v_job.prompt_text,
      v_job.background_mode,
      false,
      v_job.generation_type,
      COALESCE(p_generation_metadata, v_job.generation_metadata),
      v_job.model,
      v_job.source_image_stock_id,
      p_job_id,
      v_index
    )
    RETURNING gi.id INTO v_inserted_id;

    IF v_index = 0 THEN
      v_first_image_id := v_inserted_id;
      v_first_image_url := v_image_url;
    END IF;

    v_index := v_index + 1;
  END LOOP;

  UPDATE public.image_jobs
  SET
    status = 'succeeded',
    processing_stage = 'completed',
    result_image_url = COALESCE(NULLIF(TRIM(p_result_image_url), ''), v_first_image_url),
    error_message = NULL,
    completed_at = now(),
    generation_metadata = COALESCE(p_generation_metadata, v_job.generation_metadata),
    updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing';

  UPDATE public.credit_transactions
  SET related_generation_id = v_first_image_id
  WHERE user_id = v_job.user_id
    AND related_generation_id IS NULL
    AND transaction_type = 'consumption'
    AND metadata->>'job_id' = p_job_id::text;

  RETURN QUERY
  SELECT
    gi.id,
    gi.image_url,
    gi.storage_path,
    gi.image_job_result_index
  FROM public.generated_images AS gi
  WHERE gi.image_job_id = p_job_id
  ORDER BY gi.image_job_result_index ASC NULLS LAST, gi.created_at ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_image_job_with_generated_images(
  uuid,
  jsonb,
  jsonb,
  text
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_image_job_with_generated_images(
  uuid,
  jsonb,
  jsonb,
  text
) TO service_role;
