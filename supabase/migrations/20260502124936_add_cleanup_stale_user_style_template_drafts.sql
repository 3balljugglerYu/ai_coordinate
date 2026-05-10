-- ===============================================
-- pg_cron: 24h 経過 draft の自動掃除
-- ===============================================

DO $do$
DECLARE
  v_existing_job_id BIGINT;
  v_function_url TEXT := 'https://hnrccaxrvhtbuihfvitc.supabase.co/functions/v1/style-template-cleanup';
  v_cron_secret TEXT;
  v_headers JSONB;
  v_command TEXT;
BEGIN
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'cleanup_stale_user_style_template_drafts'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'style_template_cleanup_cron_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_cron_secret := NULL;
  END;

  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    v_headers := jsonb_build_object('Content-Type', 'application/json');
    RAISE NOTICE 'style_template_cleanup_cron_secret is not set in vault; cron will run without Authorization header';
  ELSE
    v_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cron_secret
    );
  END IF;

  v_command := format(
    $cmd$
    SELECT net.http_post(
      url := %L,
      headers := %L::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $cmd$,
    v_function_url,
    v_headers::text
  );

  PERFORM cron.schedule(
    'cleanup_stale_user_style_template_drafts',
    '0 * * * *',
    v_command
  );
END;
$do$;
