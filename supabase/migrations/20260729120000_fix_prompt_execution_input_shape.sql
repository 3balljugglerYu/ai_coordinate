-- ===============================================
-- Phase 0A の是正 (2): execution record の形を Worker の実入力に合わせる
-- ===============================================
-- 設計判断: docs/planning/free-prompt-private-mode-implementation-plan.md
--           ADR-001 / REQ-003b
--
-- 20260729100000 は materialized record に
--   CHECK (snapshot_kind <> 'materialized' OR provider_prompt IS NOT NULL)
-- を置いたが、これは Worker の実際の入力要件と合っていない。
--
-- Worker が生成種別ごとに必要とする入力（image-gen-worker/index.ts:1986-2025）:
--
--   generation_type   | 必要な入力                      | 開示可否
--   ------------------+---------------------------------+------------------
--   coordinate / free | 生入力。buildSharedPrompt で加工 | 原作者へ開示可
--   one_tap_style     | 組み立て済み全文。そのまま送信   | 開示不可(運営資産)
--   inspire           | 不要。job 列から組み立て         | -
--   creator_looks     | 不要。hidden prompt から組み立て | -
--
-- したがって:
--   - coordinate / free は author_input だけを持ち provider_prompt は NULL
--   - one_tap_style は provider_prompt だけを持ち author_input は NULL
--   - inspire / creator_looks はどちらも NULL
--
-- 元の CHECK は前2つのうち coordinate / free と、inspire / creator_looks を
-- 弾いてしまう。正しい不変条件は「両方を同時に持たない」である。
-- 開示可能な入力と開示不可の全文が同じ行に同居しないことを保証する。

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.generation_prompt_snapshots
  DROP CONSTRAINT IF EXISTS generation_prompt_snapshots_materialized_shape;

ALTER TABLE public.generation_prompt_snapshots
  ADD CONSTRAINT generation_prompt_snapshots_materialized_shape CHECK (
    snapshot_kind <> 'materialized'
    OR provider_prompt IS NULL
    OR author_input IS NULL
  );

COMMENT ON COLUMN public.generation_prompt_snapshots.provider_prompt IS
  '運営が組み立てた開示不可の全文 (one_tap_style)。Worker はそのまま provider へ送る';
COMMENT ON COLUMN public.generation_prompt_snapshots.author_input IS
  '原作者の生入力 (coordinate / free)。Worker が実行時に錨を付けて組み立てる。生成成功時に author secret へ転記する';

-- 完了 RPC の dual-write を実入力に合わせる。
-- legacy の generated_images.prompt には coordinate / free なら生入力、
-- one_tap_style なら組み立て済み全文が入っていた。移行期間中も同じ値を書く。
CREATE OR REPLACE FUNCTION public.complete_image_job_with_prompt_secrets(
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
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_job public.image_jobs%ROWTYPE;
  v_execution public.generation_prompt_snapshots%ROWTYPE;
  v_legacy_prompt text;
  v_expected_count integer;
  v_image_count integer;
  v_image jsonb;
  v_index integer := 0;
  v_image_url text;
  v_storage_path text;
  v_image_width integer;
  v_image_height integer;
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

  -- 冪等: すでに成功しているなら既存行を返す
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

  -- 移行期間中は execution record が無い legacy job も通す。
  -- Phase 0C 以降は Worker 側が record 必須で fail closed する。
  SELECT *
  INTO v_execution
  FROM public.generation_prompt_snapshots
  WHERE generation_prompt_snapshots.image_job_id = p_job_id;

  -- dual-write する legacy 値。
  -- legacy job は prompt_text に、新規 job は execution record に入力がある。
  -- coordinate / free は author_input、one_tap_style は provider_prompt。
  v_legacy_prompt := COALESCE(
    NULLIF(v_job.prompt_text, ''),
    v_execution.author_input,
    v_execution.provider_prompt,
    ''
  );

  FOR v_image IN
    SELECT element
    FROM jsonb_array_elements(p_images) AS elements(element)
  LOOP
    v_image_url := NULLIF(TRIM(v_image->>'image_url'), '');
    v_storage_path := NULLIF(TRIM(v_image->>'storage_path'), '');
    v_image_width := CASE
      WHEN v_image->>'width' ~ '^[1-9][0-9]*$' THEN (v_image->>'width')::integer
      ELSE NULL
    END;
    v_image_height := CASE
      WHEN v_image->>'height' ~ '^[1-9][0-9]*$' THEN (v_image->>'height')::integer
      ELSE NULL
    END;

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
      width,
      height,
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
      v_legacy_prompt,
      v_job.background_mode,
      false,
      v_job.generation_type,
      COALESCE(p_generation_metadata, v_job.generation_metadata),
      v_job.model,
      v_job.source_image_stock_id,
      p_job_id,
      v_index,
      v_image_width,
      v_image_height,
      v_job.style_template_id,
      v_job.override_target,
      v_job.override_outfit,
      v_job.override_angle,
      v_job.override_pose,
      v_job.override_background
    )
    RETURNING gi.id INTO v_inserted_id;

    -- author secret はユーザーへ開示し得る生入力があるときだけ作る。
    -- 派生 job は snapshot_kind='derived_reference' で author_input を
    -- 持てない (テーブル CHECK) ため、ここには入らない。
    IF v_execution.snapshot_kind = 'materialized'
       AND v_execution.author_input IS NOT NULL
       AND v_execution.author_input_owner_id IS NOT NULL
    THEN
      INSERT INTO public.generated_image_prompt_secrets (
        image_id,
        prompt,
        prompt_owner_id,
        source_kind
      )
      VALUES (
        v_inserted_id,
        v_execution.author_input,
        v_execution.author_input_owner_id,
        'author_input'
      )
      ON CONFLICT (image_id) DO NOTHING;
    END IF;

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

REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text) TO service_role;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- ALTER TABLE public.generation_prompt_snapshots
--   DROP CONSTRAINT generation_prompt_snapshots_materialized_shape,
--   ADD CONSTRAINT generation_prompt_snapshots_materialized_shape
--     CHECK (snapshot_kind <> 'materialized' OR provider_prompt IS NOT NULL);
-- COMMIT;
-- ===============================================
