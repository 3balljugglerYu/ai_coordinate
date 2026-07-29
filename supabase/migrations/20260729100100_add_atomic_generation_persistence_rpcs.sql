-- ===============================================
-- Phase 0A (expand): 生成 job と秘密を原子的に書く RPC を追加する
-- ===============================================
-- 設計判断: docs/planning/free-prompt-private-mode-implementation-plan.md
--           ADR-001 / ADR-002 / REQ-003b / REQ-003c / REQ-003d
--
-- このマイグレーションは additive のみで、既存の挙動を一切変更しない。
--   - 既存の complete_image_job_with_generated_images はそのまま残す
--   - ここで追加する 2 つの RPC は Phase 0B のコードから初めて呼ばれる
--
-- 追加する RPC:
--   1. create_image_job_with_prompt_execution
--        job と prompt execution record を同一トランザクションで作成する。
--        job だけ / record だけが残る部分成功を許さない (REQ-003c)。
--   2. complete_image_job_with_prompt_secrets
--        既存の完了 RPC に「author secret の作成」を足したもの。
--        生成画像・author secret・job 成功更新を同一トランザクションに閉じる。
--
-- なぜ job 作成を RPC に寄せるか:
--   prompt execution record を持たない job は生成入力を解決できず、
--   Worker から見て処理不能になる。ハンドラ側の注意事項ではなく、
--   「record なしでは job を作れない」構造で守る。

BEGIN;

-- ===============================================
-- 1. job + prompt execution record の原子的作成
-- ===============================================
-- p_job は image_jobs の列を持つ JSON。列追加のたびに RPC を書き換えなくて
-- 済むよう jsonb_populate_record を使う。ただし jsonb_populate_record は
-- 未指定の列を DEFAULT ではなく NULL にするため、DEFAULT を持つ列は
-- ここで明示的に補う。
--
-- p_prompt_execution は generation_prompt_snapshots の内容。
-- snapshot_kind による形の妥当性はテーブル側の CHECK が担保する。

CREATE OR REPLACE FUNCTION public.create_image_job_with_prompt_execution(
  p_job jsonb,
  p_prompt_execution jsonb
)
RETURNS TABLE (
  id uuid,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.image_jobs%ROWTYPE;
  v_kind text;
BEGIN
  IF p_job IS NULL OR jsonb_typeof(p_job) <> 'object' THEN
    RAISE EXCEPTION 'p_job must be a JSON object';
  END IF;

  IF p_prompt_execution IS NULL OR jsonb_typeof(p_prompt_execution) <> 'object' THEN
    RAISE EXCEPTION 'p_prompt_execution must be a JSON object';
  END IF;

  v_kind := p_prompt_execution->>'snapshot_kind';
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'p_prompt_execution.snapshot_kind is required';
  END IF;

  v_job := jsonb_populate_record(NULL::public.image_jobs, p_job);

  -- DEFAULT を持つ列を補う (jsonb_populate_record は NULL で埋めるため)
  v_job.id := COALESCE(v_job.id, gen_random_uuid());
  v_job.generation_type := COALESCE(v_job.generation_type, 'coordinate');
  v_job.status := COALESCE(v_job.status, 'queued');
  v_job.attempts := COALESCE(v_job.attempts, 0);
  v_job.background_mode := COALESCE(v_job.background_mode, 'keep');
  v_job.source_image_type := COALESCE(v_job.source_image_type, 'illustration');
  v_job.processing_stage := COALESCE(v_job.processing_stage, 'queued');
  v_job.requested_image_count := COALESCE(v_job.requested_image_count, 1);
  v_job.created_at := COALESCE(v_job.created_at, now());
  v_job.updated_at := COALESCE(v_job.updated_at, now());

  -- 新規 job のユーザー可読列に本文を残さない (REQ-006 / REQ-019)。
  -- 呼び出し側が何を渡しても、ここで空へ正規化する。
  v_job.prompt_text := '';

  INSERT INTO public.image_jobs VALUES (v_job.*);

  INSERT INTO public.generation_prompt_snapshots (
    image_job_id,
    snapshot_kind,
    provider_prompt,
    author_input,
    author_input_owner_id,
    source_kind,
    source_revision,
    template_revision_id
  )
  VALUES (
    v_job.id,
    v_kind,
    p_prompt_execution->>'provider_prompt',
    p_prompt_execution->>'author_input',
    NULLIF(p_prompt_execution->>'author_input_owner_id', '')::uuid,
    COALESCE(p_prompt_execution->>'source_kind', v_job.generation_type),
    p_prompt_execution->>'source_revision',
    NULLIF(p_prompt_execution->>'template_revision_id', '')::uuid
  );

  RETURN QUERY SELECT v_job.id, v_job.status;
END;
$function$;

COMMENT ON FUNCTION public.create_image_job_with_prompt_execution(jsonb, jsonb) IS
  'job と prompt execution record を同一トランザクションで作成する。record なしの job を作らせない (REQ-003c)';

-- ===============================================
-- 2. 完了時に author secret も同一トランザクションで作る
-- ===============================================
-- 既存の complete_image_job_with_generated_images と同じ処理に加えて、
-- prompt execution record の author_input から author secret を作る。
--
-- author secret を作る条件 (REQ-003d の第 1 層):
--   snapshot_kind = 'materialized' かつ author_input / owner が揃っていること。
-- 派生 job は必ず 'derived_reference' で本文を持たないため、この条件だけでも
-- 派生者の secret は作られない。Phase 1 で image_jobs.origin_post_id を使う
-- 独立した第 2 層を追加する。
--
-- generated_images.prompt には移行期間中も従来どおり値を書く (dual-write)。
-- 空化と CHECK 制約は Phase 0C で行う。

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
      -- 移行期間の dual-write。Phase 0C で空文字へ切り替える。
      -- execution record がある新規 job は prompt_text が空なので、
      -- materialized record の provider_prompt を使う。
      COALESCE(NULLIF(v_job.prompt_text, ''), v_execution.provider_prompt, ''),
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

COMMENT ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text) IS
  '生成画像・author secret・job 成功更新を同一トランザクションで確定する。派生 job には author secret を作らない';

-- ===============================================
-- 3. EXECUTE 権限の限定
-- ===============================================
-- どちらも service_role からのみ呼ぶ。
-- ブラウザや authenticated クライアントに直接叩かせない。

REVOKE ALL ON FUNCTION public.create_image_job_with_prompt_execution(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_image_job_with_prompt_execution(jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_image_job_with_prompt_execution(jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_image_job_with_prompt_execution(jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text) TO service_role;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text);
-- DROP FUNCTION IF EXISTS public.create_image_job_with_prompt_execution(jsonb, jsonb);
-- COMMIT;
-- ===============================================
