-- Inspire の override をラジオ単一値（override_target TEXT）からチェックボックス 4 bool
-- (override_outfit / override_angle / override_pose / override_background) に拡張する。
--
-- 本 migration は段階移行の **第 1 段** で、CHECK 制約は **追加しない**。
-- 旧コード（override_target ベース）と新コード（4 bool ベース）の両方が同居する
-- 期間を許容するため、ここでは「カラム追加 + データ変換 + RPC 更新」のみ行う。
-- CHECK 制約はコード全反映後に別 migration（20260516120100_*）で追加する。
--
-- 設計:
--   - 既存 override_target カラム（TEXT NULL）は残す（後方互換、後の migration で drop 可能）
--   - 新カラム 4 つを追加（BOOLEAN NULL）
--   - 既存データは override_target → 4 bool に migration（NULL/keep_all は 4 つ全 true）
--   - RPC complete_image_job_with_generated_images も新カラムをコピーするように更新

-- ============================================================
-- 1) image_jobs にカラム追加
-- ============================================================
ALTER TABLE public.image_jobs
  ADD COLUMN IF NOT EXISTS override_outfit BOOLEAN,
  ADD COLUMN IF NOT EXISTS override_angle BOOLEAN,
  ADD COLUMN IF NOT EXISTS override_pose BOOLEAN,
  ADD COLUMN IF NOT EXISTS override_background BOOLEAN;

COMMENT ON COLUMN public.image_jobs.override_outfit
  IS 'Inspire: image_1 の衣装を image_0 に適用するか。generation_type=inspire のときのみ NOT NULL';
COMMENT ON COLUMN public.image_jobs.override_angle
  IS 'Inspire: image_1 のカメラアングルを image_0 に適用するか。generation_type=inspire のときのみ NOT NULL';
COMMENT ON COLUMN public.image_jobs.override_pose
  IS 'Inspire: image_1 のポーズを image_0 に適用するか。generation_type=inspire のときのみ NOT NULL';
COMMENT ON COLUMN public.image_jobs.override_background
  IS 'Inspire: image_1 の背景を image_0 に適用するか。generation_type=inspire のときのみ NOT NULL';

-- ============================================================
-- 2) generated_images にも同じカラム追加（一貫性のため）
-- ============================================================
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS override_outfit BOOLEAN,
  ADD COLUMN IF NOT EXISTS override_angle BOOLEAN,
  ADD COLUMN IF NOT EXISTS override_pose BOOLEAN,
  ADD COLUMN IF NOT EXISTS override_background BOOLEAN;

-- ============================================================
-- 3) 既存データの migration（旧 override_target → 4 bool）
--    - NULL (= keep_all) → 4 つすべて true
--    - 'outfit' / 'angle' / 'pose' / 'background' → 該当 1 つだけ true
-- ============================================================
UPDATE public.image_jobs
SET
  override_outfit = CASE
    WHEN override_target IS NULL THEN TRUE
    WHEN override_target = 'outfit' THEN TRUE
    ELSE FALSE
  END,
  override_angle = CASE
    WHEN override_target IS NULL THEN TRUE
    WHEN override_target = 'angle' THEN TRUE
    ELSE FALSE
  END,
  override_pose = CASE
    WHEN override_target IS NULL THEN TRUE
    WHEN override_target = 'pose' THEN TRUE
    ELSE FALSE
  END,
  override_background = CASE
    WHEN override_target IS NULL THEN TRUE
    WHEN override_target = 'background' THEN TRUE
    ELSE FALSE
  END
WHERE generation_type = 'inspire';

UPDATE public.generated_images
SET
  override_outfit = CASE
    WHEN override_target IS NULL THEN TRUE
    WHEN override_target = 'outfit' THEN TRUE
    ELSE FALSE
  END,
  override_angle = CASE
    WHEN override_target IS NULL THEN TRUE
    WHEN override_target = 'angle' THEN TRUE
    ELSE FALSE
  END,
  override_pose = CASE
    WHEN override_target IS NULL THEN TRUE
    WHEN override_target = 'pose' THEN TRUE
    ELSE FALSE
  END,
  override_background = CASE
    WHEN override_target IS NULL THEN TRUE
    WHEN override_target = 'background' THEN TRUE
    ELSE FALSE
  END
WHERE generation_type = 'inspire';

-- ============================================================
-- 4) complete_image_job_with_generated_images RPC を更新し、
--    新カラムも image_jobs から generated_images へ COPY する
--
--    CHECK 制約はこの migration では追加しない（次の migration で追加）。
-- ============================================================
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
      override_target,
      override_outfit,
      override_angle,
      override_pose,
      override_background
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
      v_job.override_target,
      v_job.override_outfit,
      v_job.override_angle,
      v_job.override_pose,
      v_job.override_background
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
