-- ===============================================
-- 障害修正: ジョブ作成 RPC が削除済みの列を参照していた
-- ===============================================
-- 20260729110000 で generation_prompt_snapshots.template_revision_id を
-- 削除したが、その列を INSERT していた create_image_job_with_prompt_execution
-- を更新し忘れていた。
--
-- plpgsql の関数本体は CREATE 時に SQL の妥当性を検査しないため、列が無くても
-- 関数は作成でき、実行時に初めて次のエラーになる。
--
--   42703: column "template_revision_id" of relation
--          "generation_prompt_snapshots" does not exist
--
-- 影響: 新 Next.js デプロイ後、すべての生成ジョブ作成が失敗していた。
--       ジョブ行自体が作られないため image_jobs には記録が残らず、
--       ペルコインの減算も起きていない。
--
-- 再発防止として、削除した列を参照する関数が他に無いことを
-- pg_get_functiondef の全文検索で確認する。

BEGIN;

SET LOCAL lock_timeout = '5s';

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
    source_revision
  )
  VALUES (
    v_job.id,
    v_kind,
    p_prompt_execution->>'provider_prompt',
    p_prompt_execution->>'author_input',
    NULLIF(p_prompt_execution->>'author_input_owner_id', '')::uuid,
    COALESCE(p_prompt_execution->>'source_kind', v_job.generation_type),
    p_prompt_execution->>'source_revision'
  );

  RETURN QUERY SELECT v_job.id, v_job.status;
END;
$function$;

COMMENT ON FUNCTION public.create_image_job_with_prompt_execution(jsonb, jsonb) IS
  'job と prompt execution record を同一トランザクションで作成する。record なしの job を作らせない (REQ-003c)';

REVOKE ALL ON FUNCTION public.create_image_job_with_prompt_execution(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_image_job_with_prompt_execution(jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_image_job_with_prompt_execution(jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_image_job_with_prompt_execution(jsonb, jsonb) TO service_role;

-- 削除済みの列を参照している関数が他に残っていないことを確認する。
-- plpgsql は実行時までエラーにならないため、定義文の全文検索で潰しておく。
DO $$
DECLARE
  v_stale text;
BEGIN
  SELECT string_agg(p.proname, ', ')
  INTO v_stale
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    -- pg_get_functiondef は集約関数 (array_agg 等) に対して使えないため、
    -- 通常の関数だけに絞る。
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) LIKE '%template_revision_id%';

  IF v_stale IS NOT NULL THEN
    RAISE EXCEPTION
      '削除済みの列を参照している関数が残っている: %', v_stale;
  END IF;
END;
$$;

COMMIT;
