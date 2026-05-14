-- complete_image_job_with_generated_images が generated_images へ INSERT する際、
-- inspire (generation_type='inspire') のとき style_template_id / override_target を
-- image_jobs から継承しないと、generated_images_inspire_template_consistency_check
-- (generation_type='inspire' ⇔ style_template_id IS NOT NULL) に違反して
-- 「画像メタデータの保存に失敗しました: new row for relation "generated_images" violates check constraint」
-- が発生する。
--
-- 修正: INSERT に style_template_id / override_target を追加し、image_jobs から COPY する。
-- 関数 signature・引数・RETURNS は不変。CREATE OR REPLACE で置換のみ。

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
#variable_conflict use_column
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
  WHERE image_jobs.id = p_job_id
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
      image_job_result_index,
      style_template_id,
      override_target
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
      v_index,
      v_job.style_template_id,
      v_job.override_target
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
  WHERE image_jobs.id = p_job_id
    AND image_jobs.status = 'processing';

  UPDATE public.credit_transactions
  SET related_generation_id = v_first_image_id
  WHERE credit_transactions.user_id = v_job.user_id
    AND credit_transactions.related_generation_id IS NULL
    AND credit_transactions.transaction_type = 'consumption'
    AND credit_transactions.metadata->>'job_id' = p_job_id::text;

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
