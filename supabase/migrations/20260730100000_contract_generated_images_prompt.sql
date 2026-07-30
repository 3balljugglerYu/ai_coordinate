-- ===============================================
-- Phase 0C (contract): 公開列からプロンプトを消し、再発を DB で拒否する
-- ===============================================
-- 設計判断: docs/planning/free-prompt-private-mode-implementation-plan.md
--           ADR-001 / ADR-009 / REQ-020 / REQ-020a
--
-- ここが既存漏洩を実際に閉じる工程である。
-- generated_images は行単位 RLS で anon にも開放されており列を絞れないため、
-- この列に値がある限り、公開 anon キーで select=prompt が通ってしまう。
-- 本文の正本は Phase 0B までに author secret / 実行入力レコードへ移してあり、
-- 表示・生成ともにこの列を読まなくなっている。
--
-- ★ 適用順序が重要 ★
-- この migration より先に、次の2つがデプロイ済みであること。
--   1. Next.js (legacy フォールバックを外した読み取り)
--   2. Worker  (直接 INSERT が prompt='' を書く版)
-- 旧 Worker のまま適用すると、Gemini 経路の INSERT が CHECK 違反で失敗する。
--
-- 不可逆性について:
--   この UPDATE 自体は不可逆だが、本文は secret 側に残っているため、
--   万一のときは secret から書き戻せる（20260729150000 / 160000 で実証済み）。
--   日次物理バックアップ(7日分)も確認済み。PITR は不要と判断した。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ===============================================
-- 0. 事前検証: 空化して表示を失う行が「想定内の孤児」だけであること
-- ===============================================
-- 開示対象 (coordinate / free) で本文が残っているのに secret が無い行は、
-- 空化すると表示手段を失う。事前調査 (2026-07-30) では該当が 3 行で、
-- いずれも user_id IS NULL・未投稿・ジョブ紐付けなしの孤児だった。
-- RLS 上、未投稿かつ所有者なしの行は誰にも見えないため、失っても影響がない。
--
-- 所有者のいる行が 1 件でも混ざっていたら、backfill 漏れなので中断する。

DO $$
DECLARE
  v_owned_loss integer;
  v_orphan_loss integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE gi.user_id IS NOT NULL),
    count(*) FILTER (WHERE gi.user_id IS NULL)
  INTO v_owned_loss, v_orphan_loss
  FROM public.generated_images AS gi
  WHERE gi.generation_type IN ('coordinate', 'free')
    AND gi.prompt <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM public.generated_image_prompt_secrets AS s
      WHERE s.image_id = gi.id
    );

  IF v_owned_loss > 0 THEN
    RAISE EXCEPTION
      '所有者のいる行 % 件が secret を持たないまま空化されようとしている。backfill 漏れのため中断', v_owned_loss;
  END IF;

  RAISE NOTICE '空化で表示を失うのは所有者なしの孤児 % 件のみ（想定どおり）', v_orphan_loss;
END;
$$;

-- secret と legacy の整合を最終確認する（件数・内容・所有者・運営資産の非混入）
DO $$
DECLARE
  v_digest_mismatch integer;
  v_platform_leak integer;
BEGIN
  SELECT count(*)
  INTO v_digest_mismatch
  FROM public.generated_images AS gi
  JOIN public.generated_image_prompt_secrets AS s ON s.image_id = gi.id
  WHERE gi.prompt <> ''
    AND md5(gi.prompt) <> md5(s.prompt);

  IF v_digest_mismatch > 0 THEN
    RAISE EXCEPTION 'legacy と secret の内容不一致が % 件。中断', v_digest_mismatch;
  END IF;

  SELECT count(*)
  INTO v_platform_leak
  FROM public.generated_image_prompt_secrets AS s
  JOIN public.generated_images AS gi ON gi.id = s.image_id
  WHERE gi.generation_type IN ('one_tap_style', 'inspire');

  IF v_platform_leak > 0 THEN
    RAISE EXCEPTION '運営資産が author secret に % 件混入している。中断', v_platform_leak;
  END IF;
END;
$$;

-- ===============================================
-- 1. 完了 RPC の dual-write を止める
-- ===============================================
-- Phase 0B の complete_image_job_with_prompt_secrets は移行期間の互換として
-- legacy 値を generated_images.prompt へ書いていた。以後は空文字だけを書く。
-- author secret の作成はそのまま維持する。

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
      -- 本文はユーザーが読める列に置かない。表示は author secret から
      -- 解決される (REQ-020)。
      '',
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

-- 旧完了 RPC はもう呼ばれないが、定義が残っている限り「呼べば非空を書く」
-- 経路になる。CHECK 追加後は実行時エラーになるだけだが、prompt_text を
-- コピーしない版へ置き換えて無害化しておく。
-- 定義全体の置き換えはせず、INSERT の prompt だけを '' にした版を上書きする。

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'complete_image_job_with_generated_images';

  IF v_def IS NULL THEN
    RAISE NOTICE '旧完了RPCは存在しない。スキップ';
    RETURN;
  END IF;

  -- v_job.prompt_text を '' に置き換えて再定義する
  IF v_def NOT LIKE '%v_job.prompt_text,%' THEN
    RAISE EXCEPTION '旧完了RPCの形が想定と異なる。手動確認が必要';
  END IF;

  v_def := replace(v_def, 'v_job.prompt_text,', '''''::text, -- 本文は書かない (REQ-020)');
  EXECUTE v_def;
END;
$$;

-- ===============================================
-- 2. 公開列を空にする
-- ===============================================

UPDATE public.generated_images
SET prompt = ''
WHERE prompt <> '';

-- ===============================================
-- 3. 再発を DB で拒否する (REQ-020 / REQ-020a)
-- ===============================================
-- DEFAULT '' を併せるのは、prompt を省略する INSERT が NOT NULL 違反で
-- 落ちないようにするため。将来の新しい書き込み経路の事故を減らす。

ALTER TABLE public.generated_images
  ALTER COLUMN prompt SET DEFAULT '';

ALTER TABLE public.generated_images
  ADD CONSTRAINT generated_images_prompt_must_be_empty
  CHECK (prompt = '') NOT VALID;

ALTER TABLE public.generated_images
  VALIDATE CONSTRAINT generated_images_prompt_must_be_empty;

COMMENT ON COLUMN public.generated_images.prompt IS
  '常に空。本文は generated_image_prompt_secrets (原作者入力) と generation_prompt_snapshots (生成実行入力) にのみ存在する。列は select("*") 互換のため残している (ADR-001)';

-- ===============================================
-- 4. image_jobs.prompt_text の終端ジョブを空にする
-- ===============================================
-- SELECT RLS が auth.uid() = user_id のため、One-Tap Style の組み立て済み
-- 全文が生成した本人から読める状態が残っていた (REQ-019)。
-- queued / processing は Worker が参照する可能性があるため対象外とするが、
-- 適用時点で 0 件であることを確認する（0 件でなければ中断して待つ）。

DO $$
DECLARE
  v_active integer;
  v_active_without_record integer;
BEGIN
  SELECT count(*)
  INTO v_active
  FROM public.image_jobs
  WHERE status IN ('queued', 'processing');

  IF v_active > 0 THEN
    -- 実行入力レコードを持たない active ジョブが 1 件でもあれば、空化すると
    -- そのジョブは生成入力を失う。全件レコード持ちなら空化しても影響がない。
    SELECT count(*)
    INTO v_active_without_record
    FROM public.image_jobs AS j
    WHERE j.status IN ('queued', 'processing')
      AND NOT EXISTS (
        SELECT 1
        FROM public.generation_prompt_snapshots AS s
        WHERE s.image_job_id = j.id
      );

    IF v_active_without_record > 0 THEN
      RAISE EXCEPTION
        '実行入力レコードを持たない active ジョブが % 件ある。完了を待ってから再適用すること', v_active_without_record;
    END IF;
  END IF;
END;
$$;

-- 実行時の件数を記録してから空化する（固定件数を前提にしない）
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT generation_type, status, count(*) AS n
    FROM public.image_jobs
    WHERE prompt_text <> ''
    GROUP BY 1, 2
    ORDER BY 1, 2
  LOOP
    RAISE NOTICE 'prompt_text 空化対象: % / % = % 件', r.generation_type, r.status, r.n;
  END LOOP;
END;
$$;

UPDATE public.image_jobs
SET prompt_text = ''
WHERE prompt_text <> ''
  AND status NOT IN ('queued', 'processing');

-- ===============================================
-- 5. 旧 prompt の trigram index を落とす
-- ===============================================
-- 列は常に空になったため、この index が支える検索は存在しない。
-- 検索は caption / nickname の index (20260729170000) へ移行済み。

DROP INDEX IF EXISTS public.idx_generated_images_prompt_trgm;

-- ===============================================
-- 6. 事後検証
-- ===============================================

DO $$
DECLARE
  v_nonempty_images integer;
  v_nonempty_terminal_jobs integer;
BEGIN
  SELECT count(*)
  INTO v_nonempty_images
  FROM public.generated_images
  WHERE prompt <> '';

  IF v_nonempty_images > 0 THEN
    RAISE EXCEPTION 'generated_images.prompt に非空が % 件残っている', v_nonempty_images;
  END IF;

  SELECT count(*)
  INTO v_nonempty_terminal_jobs
  FROM public.image_jobs
  WHERE prompt_text <> ''
    AND status NOT IN ('queued', 'processing');

  IF v_nonempty_terminal_jobs > 0 THEN
    RAISE EXCEPTION '終端ジョブの prompt_text に非空が % 件残っている', v_nonempty_terminal_jobs;
  END IF;

  RAISE NOTICE 'contract 完了: 公開列と終端ジョブからプロンプトが消え、CHECK が有効';
END;
$$;

COMMIT;

-- ===============================================
-- DOWN（緊急時のみ・秘匿境界が開くため原則使わない）:
-- BEGIN;
-- ALTER TABLE public.generated_images
--   DROP CONSTRAINT generated_images_prompt_must_be_empty;
-- UPDATE public.generated_images gi
-- SET prompt = s.prompt
-- FROM public.generated_image_prompt_secrets s
-- WHERE s.image_id = gi.id;
-- COMMIT;
-- ===============================================
