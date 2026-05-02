-- ===============================================
-- pg_cron: 24h 経過 draft の自動掃除
-- ===============================================
-- ADR-005 / ADR-011 参照
-- pg_net で /functions/v1/style-template-cleanup を 1 時間ごとに叩く。
-- 既存パターン（image-gen-worker-cron, Dashboard で登録）に準拠して URL は project_ref をハードコード。
--
-- 認証: Authorization ヘッダに CRON_SECRET を載せる（Vault から取得）。
--   Vault に 'style_template_cleanup_cron_secret' が存在しない場合は Authorization なしで起動する
--   （Edge Function 側 CRON_SECRET 未設定なら通過、設定済なら 401 で空振り、いずれも DB に副作用なし）。
--
-- 本番デプロイ前チェックリスト（計画 §10.2 参照）:
--   1. Edge Function `style-template-cleanup` を deploy（verify_jwt: false）
--   2. Edge Function Secrets に `CRON_SECRET` を設定
--   3. Supabase Vault に同じ値で `style_template_cleanup_cron_secret` を保存:
--        SELECT vault.create_secret('<同じ値>', 'style_template_cleanup_cron_secret');
--   4. 本マイグレーションを適用
--
-- 多環境運用時:
--   下記 v_function_url を環境別に書き換える必要あり（ステージング/開発で別 project_ref になる場合）。
--   現状は本番（AI coordinate）のみのため hnrccaxrvhtbuihfvitc を使用。

DO $do$
DECLARE
  v_existing_job_id BIGINT;
  v_function_url TEXT := 'https://hnrccaxrvhtbuihfvitc.supabase.co/functions/v1/style-template-cleanup';
  v_cron_secret TEXT;
  v_headers JSONB;
  v_command TEXT;
BEGIN
  -- 既存 job があれば削除（再 apply 時の idempotency）
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'cleanup_stale_user_style_template_drafts'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  -- Vault から CRON_SECRET を取得（未設定なら Authorization 省略）
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

  -- cron コマンド: 毎時 0 分に Edge Function を叩く
  -- 注意: cron.schedule は SQL 文字列を保存するため、Vault の値はスケジュール登録時点の値で
  --       展開される。後から CRON_SECRET を更新したらこのマイグレを再実行する必要あり。
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
    '0 * * * *',  -- 毎時 0 分
    v_command
  );
END;
$do$;

-- ===============================================
-- DOWN:
-- DO $do$
-- DECLARE
--   v_existing_job_id BIGINT;
-- BEGIN
--   SELECT jobid INTO v_existing_job_id FROM cron.job WHERE jobname = 'cleanup_stale_user_style_template_drafts' LIMIT 1;
--   IF v_existing_job_id IS NOT NULL THEN
--     PERFORM cron.unschedule(v_existing_job_id);
--   END IF;
-- END;
-- $do$;
-- ===============================================
