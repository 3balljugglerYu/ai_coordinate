-- ===============================================
-- Phase 1: 派生生成の検証・記録・集計 RPC と利用イベント
-- ===============================================
-- 設計判断: docs/planning/free-prompt-private-mode-implementation-plan.md
--           ADR-006 / ADR-008 / REQ-007 / REQ-007a / REQ-012 / REQ-023
--
-- 派生生成は「原作の投稿 ID だけを受け取り、サーバー側でプロンプトを解決する」
-- 設計である。クライアントへ本文を渡さないため、認可と解決を DB 側の RPC に
-- 集約する。
--
-- RPC は役割で 2 本に分ける。
--   validate_...  本文を返さない。API の job 作成前、Worker の課金前、
--                 provider 完了後の再検証に使う
--   resolve_...   本文を返す。Worker が provider 送信直前にだけ使う
--
-- 本文を返す経路を 1 箇所に絞ることで、うっかり別の場所へ渡す余地を減らす。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ===============================================
-- 1. 利用イベント（改ざん不可の利用数の根拠）
-- ===============================================
-- generated_images を数える案は採らない。同テーブルは所有者が
-- INSERT / UPDATE / DELETE でき、任意の原作 ID を自分の行に設定すれば
-- 利用数を水増しできる。派生画像を削除すると数が減る問題もある。
--
-- image_job_id を UNIQUE にすることで、Worker の再試行や
-- キュー再配送でイベントが重複しない (REQ-023)。

-- image_job_id に FK を張らない。image_jobs には authenticated が自分の行を
-- DELETE できるポリシーがあるため、ON DELETE CASCADE にすると派生した本人が
-- 自分のジョブを消すだけで利用イベントも消え、原作者に見える利用数を減らせる。
-- 子テーブル側の権限を絞っても FK cascade は防げない。
-- ADR-008 の「イベントは削除しないため単調増加する」を守るため、
-- source_post_id と同じくスナップショット値として保持する。

CREATE TABLE IF NOT EXISTS public.prompt_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK なし（親ジョブの削除で消えないようにする）
  image_job_id UUID NOT NULL UNIQUE,
  origin_post_id UUID NOT NULL,
  origin_author_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.prompt_usage_events IS
  '派生生成の成功イベント。利用数の算出根拠。service_role のみアクセス可。image_job_id UNIQUE で再試行時の重複を防ぐ';
COMMENT ON COLUMN public.prompt_usage_events.origin_author_id IS
  '原作者。利用数から原作者自身を除外するために保存する（後から原作が削除されても除外できる）';

CREATE INDEX IF NOT EXISTS idx_prompt_usage_events_origin
  ON public.prompt_usage_events (origin_post_id);

ALTER TABLE public.prompt_usage_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.prompt_usage_events FROM PUBLIC;
REVOKE ALL ON TABLE public.prompt_usage_events FROM anon;
REVOKE ALL ON TABLE public.prompt_usage_events FROM authenticated;

DROP POLICY IF EXISTS "prompt_usage_events_no_public_access"
  ON public.prompt_usage_events;
CREATE POLICY "prompt_usage_events_no_public_access"
  ON public.prompt_usage_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ===============================================
-- 2. 認可の共通条件（本文を返さない）
-- ===============================================
-- ADR-006 の全条件をここに集約する。条件が 1 つでも欠けると別種の
-- 秘匿プロンプトの回収経路になるため、API と Worker の双方から同じ関数を呼ぶ。
--
-- 派生 ID が渡された場合は root へ解決する。A→B→C と派生しても、
-- 常に根の原作を指すようにする (ADR-003)。

CREATE OR REPLACE FUNCTION public.validate_derived_prompt_source(
  p_source_post_id uuid,
  p_requester_id uuid
)
RETURNS TABLE (
  is_available boolean,
  root_post_id uuid,
  origin_author_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_post public.generated_images%ROWTYPE;
  v_root public.generated_images%ROWTYPE;
BEGIN
  -- 利用不可の理由は呼び出し側へ返さない。削除・投稿取消・公開停止・
  -- 非公開解除のどれであっても同じ結果にする (ADR-005)。
  -- 理由を返すと、そこから原作の状態を推測できてしまう。
  IF p_source_post_id IS NULL OR p_requester_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_post
  FROM public.generated_images
  WHERE id = p_source_post_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 派生 ID を渡された場合は根へ解決する
  IF v_post.source_post_id IS NOT NULL THEN
    SELECT * INTO v_root
    FROM public.generated_images
    WHERE id = v_post.source_post_id;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
  ELSE
    v_root := v_post;
  END IF;

  IF v_root.user_id IS NULL
     OR v_root.is_posted IS NOT TRUE
     OR v_root.moderation_status <> 'visible'
     OR v_root.generation_type <> 'free'
     OR v_root.prompt_visibility <> 'private'
     OR v_root.source_post_id IS NOT NULL
  THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- author secret が無ければ解決できない
  IF NOT EXISTS (
    SELECT 1
    FROM public.generated_image_prompt_secrets
    WHERE image_id = v_root.id
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 原作者のアカウントが削除予定なら利用不可
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = v_root.user_id
      AND deletion_scheduled_at IS NOT NULL
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 双方向いずれのブロック関係も不可
  IF EXISTS (
    SELECT 1
    FROM public.user_blocks
    WHERE (blocker_id = v_root.user_id AND blocked_id = p_requester_id)
       OR (blocker_id = p_requester_id AND blocked_id = v_root.user_id)
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 本人、または原作者をフォローしていること
  IF v_root.user_id <> p_requester_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.follows
       WHERE follower_id = p_requester_id
         AND followee_id = v_root.user_id
     )
  THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_root.id, v_root.user_id;
END;
$function$;

COMMENT ON FUNCTION public.validate_derived_prompt_source(uuid, uuid) IS
  '派生生成の認可を検証する。本文は返さない。利用不可の理由も返さない (ADR-005 / ADR-006)';

-- ===============================================
-- 3. 本文の解決（Worker が provider 送信直前にだけ使う）
-- ===============================================
-- 認可を同一 statement で再検証してから本文を返す。検証と解決を分けると
-- その間に条件が変わる余地ができるため、必ずこの関数を通す。

CREATE OR REPLACE FUNCTION public.resolve_derived_prompt_source(
  p_source_post_id uuid,
  p_requester_id uuid
)
RETURNS TABLE (
  root_post_id uuid,
  origin_author_id uuid,
  author_input text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_valid boolean;
  v_root uuid;
  v_author uuid;
BEGIN
  SELECT v.is_available, v.root_post_id, v.origin_author_id
  INTO v_valid, v_root, v_author
  FROM public.validate_derived_prompt_source(p_source_post_id, p_requester_id) AS v;

  IF NOT COALESCE(v_valid, false) THEN
    -- 呼び出し側は固定内部コードで終端させる。理由は返さない。
    RAISE EXCEPTION 'DERIVED_PROMPT_SOURCE_UNAVAILABLE';
  END IF;

  RETURN QUERY
  SELECT v_root, v_author, s.prompt
  FROM public.generated_image_prompt_secrets AS s
  WHERE s.image_id = v_root;
END;
$function$;

COMMENT ON FUNCTION public.resolve_derived_prompt_source(uuid, uuid) IS
  '認可を再検証してから原作者の入力を返す。Worker が provider 送信直前にだけ使う。本文を返す唯一の経路';

-- ===============================================
-- 4. 利用イベントの記録（冪等）
-- ===============================================
-- 成功済みジョブから値を導出する。呼び出し側の引数を信用しない。
-- 引数で origin や user を受け取ると、任意の値で水増しできてしまう。

CREATE OR REPLACE FUNCTION public.record_prompt_usage(
  p_image_job_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.image_jobs%ROWTYPE;
  v_origin_author uuid;
BEGIN
  SELECT * INTO v_job
  FROM public.image_jobs
  WHERE id = p_image_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'image job not found: %', p_image_job_id;
  END IF;

  -- 派生ジョブでなければ記録しない
  IF v_job.origin_post_id IS NULL THEN
    RETURN;
  END IF;

  IF v_job.status <> 'succeeded' THEN
    RAISE EXCEPTION
      '成功していないジョブの利用イベントは記録しない: %, status=%',
      p_image_job_id, v_job.status;
  END IF;

  -- 原作者は原作行から取る。削除済みでも記録は残す。
  SELECT user_id INTO v_origin_author
  FROM public.generated_images
  WHERE id = v_job.origin_post_id;

  INSERT INTO public.prompt_usage_events (
    image_job_id,
    origin_post_id,
    origin_author_id,
    user_id
  )
  VALUES (
    p_image_job_id,
    v_job.origin_post_id,
    COALESCE(v_origin_author, v_job.user_id),
    v_job.user_id
  )
  ON CONFLICT (image_job_id) DO NOTHING;
END;
$function$;

COMMENT ON FUNCTION public.record_prompt_usage(uuid) IS
  '派生生成の成功を冪等に記録する。origin と利用者は成功済みジョブから導出し、引数を信用しない';

-- ===============================================
-- 5. 利用数の集計（service-only）
-- ===============================================
-- authenticated へ EXECUTE を与えない。与えると任意の原作 UUID を渡して
-- 利用状況を列挙できるサイドチャネルになる。
-- Server API が原作の閲覧可否を適用したうえで結果だけをレスポンスへ載せる。
--
-- なお、投稿済み派生の件数は generated_images.source_post_id から anon でも
-- 部分的に数えられる（系譜を公開表示する仕様に伴う）。ここで守るのは
-- 未投稿・非公開を含む全成功生成数とユニーク利用者数である。

CREATE OR REPLACE FUNCTION public.get_prompt_usage_count(
  p_origin_post_id uuid
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $function$
  SELECT count(DISTINCT e.user_id)::integer
  FROM public.prompt_usage_events AS e
  WHERE e.origin_post_id = p_origin_post_id
    -- 原作者自身の生成は数えない
    AND e.user_id <> e.origin_author_id;
$function$;

COMMENT ON FUNCTION public.get_prompt_usage_count(uuid) IS
  '原作を使ったユニーク利用者数。原作者自身は除外。service-only（任意UUIDでの列挙を防ぐ）';

-- ===============================================
-- 6. EXECUTE 権限
-- ===============================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'validate_derived_prompt_source(uuid, uuid)',
      'resolve_derived_prompt_source(uuid, uuid)',
      'record_prompt_usage(uuid)',
      'get_prompt_usage_count(uuid)'
    ]) AS sig
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', r.sig);
  END LOOP;
END;
$$;

-- ===============================================
-- 7. 完了 RPC を派生ジョブ対応にする
-- ===============================================
-- 派生画像には出所を保存し、author secret は作らない。
--
-- 出所は呼び出し引数から受け取らず、検証済みジョブの origin_post_id と
-- 原作行から導出する。引数で受け取ると偽装できる。
--
-- author secret の抑止は origin_post_id を独立条件にする。author_input の
-- NULL 判定だけに頼ると、将来 provider_prompt へフォールバックする変更が
-- 入ったときに原作者の入力が派生者の secret として作られてしまう。

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
  v_origin_author uuid;
  v_origin_available boolean;
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

  -- 派生ジョブは完了時点でも認可が有効か再検証する (REQ-004 / REQ-011)。
  --
  -- 生成には数十秒〜数分かかるため、その間に原作者が投稿を取り消す・非公開に
  -- する・派生者をブロックする・アカウント削除を予約する、あるいは派生者が
  -- フォローを外す、といった変化が起こり得る。存在確認だけでは
  -- 「取り消された投稿のプロンプトから作られた画像」が残ってしまう。
  --
  -- ここで失敗させると生成済みの成果物を破棄して返金することになるが、
  -- 原作者の意思を成果物より優先する（ADR-004 の延長）。
  IF v_job.origin_post_id IS NOT NULL THEN
    SELECT is_available, origin_author_id
    INTO v_origin_available, v_origin_author
    FROM public.validate_derived_prompt_source(v_job.origin_post_id, v_job.user_id);

    IF NOT COALESCE(v_origin_available, false) OR v_origin_author IS NULL THEN
      RAISE EXCEPTION
        'DERIVED_ORIGIN_UNAVAILABLE: origin post no longer usable for job %', p_job_id;
    END IF;
  END IF;

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
      override_background,
      source_post_id,
      source_author_id
    )
    VALUES (
      v_job.user_id,
      v_image_url,
      v_storage_path,
      -- 本文はユーザーが読める列に置かない。表示は author secret から
      -- 解決される (REQ-020)。
      '',
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
      v_job.override_background,
      -- 出所は検証済みジョブと原作行から導出する（REQ-009）。
      -- trigger が root / free / 原作者一致を再検証する。
      v_job.origin_post_id,
      v_origin_author
    )
    RETURNING gi.id INTO v_inserted_id;

    -- author secret はユーザーへ開示し得る生入力があるときだけ作る。
    --
    -- origin_post_id IS NULL を独立した条件にする。author_input の NULL 判定
    -- だけに頼ると、将来 provider_prompt へフォールバックする変更が入った
    -- ときに、原作者の入力が派生者の secret として作られてしまう。
    -- generated_image_prompt_secrets 側の trigger でも同じことを拒否する。
    IF v_job.origin_post_id IS NULL
       AND v_execution.snapshot_kind = 'materialized'
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

  -- 派生生成の利用イベントを同一トランザクションで記録する (REQ-012)
  IF v_job.origin_post_id IS NOT NULL THEN
    PERFORM public.record_prompt_usage(p_job_id);
  END IF;

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

REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_image_job_with_prompt_secrets(uuid, jsonb, jsonb, text, text, text) TO service_role;

-- ===============================================
-- 8. job + derived reference の原子的作成
-- ===============================================
-- 既存の create_image_job_with_prompt_execution は origin_post_id を
-- jsonb 経由で受け取れるが、trigger がクライアントロールを拒否するため
-- service role 経路からのみ設定できる。追加の RPC は不要。
--
-- ここでは、派生ジョブが derived_reference record を必ず持つことを
-- enforce_prompt_execution_kind trigger が保証していることを確認する。

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_enforce_prompt_execution_kind'
      AND tgrelid = 'public.generation_prompt_snapshots'::regclass
  ) THEN
    RAISE EXCEPTION
      'trg_enforce_prompt_execution_kind が存在しない。20260730200000 を先に適用すること';
  END IF;

  RAISE NOTICE 'Phase 1-B 完了: 利用イベント・検証RPC・解決RPC・集計RPCを追加し、完了RPCを派生対応にした';
END;
$$;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.get_prompt_usage_count(uuid);
-- DROP FUNCTION IF EXISTS public.record_prompt_usage(uuid);
-- DROP FUNCTION IF EXISTS public.resolve_derived_prompt_source(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.validate_derived_prompt_source(uuid, uuid);
-- DROP TABLE IF EXISTS public.prompt_usage_events;
-- -- 完了RPCは 20260730100000 の定義へ戻す
-- COMMIT;
-- ===============================================
