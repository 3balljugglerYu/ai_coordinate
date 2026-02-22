-- 課金整合性の異常検知（検知のみ・自動是正なし）
-- 1) 異常検知関数
-- 2) 監視実行関数（admin_audit_logへ要約記録）
-- 3) pg_cron による1時間ごとの定期実行

CREATE OR REPLACE FUNCTION public.detect_generation_billing_anomalies(
  p_since timestamptz DEFAULT (now() - interval '2 hours')
)
RETURNS TABLE (
  anomaly_type text,
  job_id uuid,
  user_id uuid,
  job_status text,
  consumption_tx_id uuid,
  refund_tx_id uuid,
  observed_at timestamptz,
  details jsonb
)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
WITH consumption AS (
  SELECT
    ct.id,
    ct.user_id,
    ct.created_at,
    ct.metadata,
    CASE
      WHEN (ct.metadata->>'job_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (ct.metadata->>'job_id')::uuid
      ELSE NULL
    END AS job_id
  FROM public.credit_transactions ct
  WHERE ct.transaction_type = 'consumption'
    AND ct.metadata ? 'job_id'
),
refund AS (
  SELECT
    ct.id,
    ct.user_id,
    ct.created_at,
    ct.metadata,
    CASE
      WHEN (ct.metadata->>'job_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (ct.metadata->>'job_id')::uuid
      ELSE NULL
    END AS job_id
  FROM public.credit_transactions ct
  WHERE ct.transaction_type = 'refund'
    AND ct.metadata ? 'job_id'
),
refund_for_succeeded_job AS (
  SELECT
    'refund_for_succeeded_job'::text AS anomaly_type,
    r.job_id,
    r.user_id,
    j.status::text AS job_status,
    c.id AS consumption_tx_id,
    r.id AS refund_tx_id,
    GREATEST(r.created_at, j.updated_at) AS observed_at,
    jsonb_build_object(
      'refund_created_at', r.created_at,
      'job_updated_at', j.updated_at,
      'job_attempts', j.attempts,
      'job_error_message', j.error_message
    ) AS details
  FROM refund r
  JOIN public.image_jobs j
    ON j.id = r.job_id
   AND j.user_id = r.user_id
  LEFT JOIN consumption c
    ON c.job_id = r.job_id
   AND c.user_id = r.user_id
  WHERE r.job_id IS NOT NULL
    AND j.status = 'succeeded'
    AND GREATEST(r.created_at, j.updated_at) >= p_since
),
consumption_missing_refund_for_failed_job AS (
  SELECT
    'consumption_without_refund_for_failed_job'::text AS anomaly_type,
    c.job_id,
    c.user_id,
    j.status::text AS job_status,
    c.id AS consumption_tx_id,
    NULL::uuid AS refund_tx_id,
    GREATEST(c.created_at, j.updated_at) AS observed_at,
    jsonb_build_object(
      'consumption_created_at', c.created_at,
      'job_updated_at', j.updated_at,
      'job_attempts', j.attempts,
      'job_error_message', j.error_message
    ) AS details
  FROM consumption c
  JOIN public.image_jobs j
    ON j.id = c.job_id
   AND j.user_id = c.user_id
  LEFT JOIN refund r
    ON r.job_id = c.job_id
   AND r.user_id = c.user_id
  WHERE c.job_id IS NOT NULL
    AND j.status = 'failed'
    AND r.id IS NULL
    AND GREATEST(c.created_at, j.updated_at) >= p_since
),
succeeded_job_without_consumption AS (
  SELECT
    'succeeded_job_without_consumption'::text AS anomaly_type,
    j.id AS job_id,
    j.user_id,
    j.status::text AS job_status,
    NULL::uuid AS consumption_tx_id,
    r.id AS refund_tx_id,
    j.updated_at AS observed_at,
    jsonb_build_object(
      'job_created_at', j.created_at,
      'job_updated_at', j.updated_at,
      'job_attempts', j.attempts,
      'job_error_message', j.error_message
    ) AS details
  FROM public.image_jobs j
  LEFT JOIN consumption c
    ON c.job_id = j.id
   AND c.user_id = j.user_id
  LEFT JOIN refund r
    ON r.job_id = j.id
   AND r.user_id = j.user_id
  WHERE j.status = 'succeeded'
    AND c.id IS NULL
    AND j.updated_at >= p_since
)
SELECT *
FROM refund_for_succeeded_job
UNION ALL
SELECT *
FROM consumption_missing_refund_for_failed_job
UNION ALL
SELECT *
FROM succeeded_job_without_consumption
ORDER BY observed_at DESC, anomaly_type;
$function$;

CREATE OR REPLACE FUNCTION public.monitor_generation_billing_anomalies(
  p_since timestamptz DEFAULT (now() - interval '2 hours')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer := 0;
  v_sample jsonb := '[]'::jsonb;
BEGIN
  WITH anomalies AS (
    SELECT *
    FROM public.detect_generation_billing_anomalies(p_since)
  ),
  counted AS (
    SELECT count(*)::integer AS cnt
    FROM anomalies
  ),
  sampled AS (
    SELECT
      COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.observed_at DESC), '[]'::jsonb) AS sample
    FROM (
      SELECT *
      FROM anomalies
      ORDER BY observed_at DESC
      LIMIT 20
    ) x
  )
  SELECT counted.cnt, sampled.sample
  INTO v_count, v_sample
  FROM counted, sampled;

  IF v_count > 0 THEN
    INSERT INTO public.admin_audit_log (
      admin_user_id,
      action_type,
      target_type,
      target_id,
      metadata
    ) VALUES (
      NULL,
      'generation_billing_anomaly_detected',
      'credit_transactions',
      NULL,
      jsonb_build_object(
        'count', v_count,
        'since', p_since,
        'sample', v_sample,
        'auto_remediation', false,
        'source', 'cron'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'count', v_count,
    'since', p_since,
    'logged', (v_count > 0)
  );
END;
$function$;

DO $do$
DECLARE
  v_existing_job_id bigint;
BEGIN
  SELECT jobid
  INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'generation_billing_anomaly_monitor_hourly'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'generation_billing_anomaly_monitor_hourly',
    '7 * * * *',
    $cron$SELECT public.monitor_generation_billing_anomalies();$cron$
  );
END;
$do$;
