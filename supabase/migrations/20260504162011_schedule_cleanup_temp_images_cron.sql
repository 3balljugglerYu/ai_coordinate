DO $do$
DECLARE
  v_existing_job_id BIGINT;
  v_new_job_id BIGINT;
  v_function_url TEXT := 'https://hnrccaxrvhtbuihfvitc.supabase.co/functions/v1/cleanup-temp-images';
  v_cron_secret TEXT;
  v_headers JSONB;
  v_command TEXT;
BEGIN
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'cleanup_temp_images_daily'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'temp_image_cleanup_cron_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_cron_secret := NULL;
  END;

  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    v_headers := jsonb_build_object('Content-Type', 'application/json');
    RAISE NOTICE 'temp_image_cleanup_cron_secret is not set in vault; cron will run without Authorization header';
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

  v_new_job_id := cron.schedule(
    'cleanup_temp_images_daily',
    '0 18 * * *',
    v_command
  );

  PERFORM cron.alter_job(job_id := v_new_job_id, active := false);
END;
$do$;
