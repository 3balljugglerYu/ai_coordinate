-- ===============================================
-- Phase 0C (expand): 完了 RPC に model / background_mode を追加する
-- ===============================================
-- 設計判断: docs/planning/free-prompt-private-mode-implementation-plan.md ADR-009
--
-- contract migration の一部として 6 引数版を定義していたが、それでは
-- 新 Worker のデプロイから contract 適用までの間、Gemini 経路の完了が
-- PostgREST の「関数が見つからない」で全件失敗する。
--
--   新Workerデプロイ ──★Gemini完了が全滅★── contract適用
--
-- 待ち時間中も新規受付は続くため、無視できる窓ではない。
-- Phase 0A/0B で守ってきた expand → contract の原則どおり、シグネチャ拡張は
-- additive な expand として先に適用する。
--
-- この migration の時点では dual-write を維持する。generated_images.prompt の
-- 空化と CHECK は contract migration が行う。
--
-- ★ このファイルは contract と別の先行 PR でマージ・適用する ★
--
-- `supabase db push` は未適用 migration をすべて順番に適用し、特定ファイルで
-- 止めるオプションを持たない。このファイルと contract を同じ未適用 PR のまま
-- push すると Worker デプロイを間へ挟めず、expand / contract 分離にならない。
--
-- 適用順序:
--   1. このファイルだけを含む先行 PR をマージする
--   2. `supabase db push --dry-run` がこの1本だけを示すことを確認して適用する
--   3. PostgREST の schema reload 後、旧4引数・新6引数の双方を疎通確認する
--   4. contract PR を main と同期し、Next.js + 新 Worker をデプロイする
--   5. contract migration を適用する

BEGIN;

SET LOCAL lock_timeout = '5s';

-- Gemini 経路も同じ RPC で確定できるよう、model と background_mode を
-- 呼び出し側から渡せるようにする。Worker は image_jobs の生値ではなく
-- 正規化後の値 (normalizeModelName / resolveBackgroundMode) を画像へ書いて
-- いたため、NULL のときだけジョブの値を使う形で互換を保つ。
CREATE OR REPLACE FUNCTION public.complete_image_job_with_prompt_secrets(
  p_job_id uuid,
  p_images jsonb,
  p_generation_metadata jsonb DEFAULT NULL::jsonb,
  p_result_image_url text DEFAULT NULL::text,
  p_model text DEFAULT NULL::text,
  p_background_mode text DEFAULT NULL::text
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
      -- 移行期の dual-write。contract migration で空文字へ切り替える。
      -- ここで空にすると、まだ legacy 列を読む可能性がある経路が壊れる。
      COALESCE(
        NULLIF(v_job.prompt_text, ''),
        v_execution.author_input,
        v_execution.provider_prompt,
        ''
      ),
      COALESCE(p_background_mode, v_job.background_mode),
      false,
      v_job.generation_type,
      COALESCE(p_generation_metadata, v_job.generation_metadata),
      COALESCE(p_model, v_job.model),
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

-- 旧シグネチャ (4引数) は overload として残らないよう明示的に落とす。
-- 残すと呼び出し側の引数漏れが「別の関数が呼ばれる」形で隠れる。
DROP FUNCTION IF EXISTS public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text);

REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text, text, text) TO service_role;

-- PostgREST が旧4引数呼び出しを6引数版の default 引数へ解決できるよう、
-- 関数シグネチャ変更を同一 transaction の commit 時に明示通知する。
NOTIFY pgrst, 'reload schema';

COMMIT;
