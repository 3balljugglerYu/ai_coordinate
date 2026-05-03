-- ===============================================
-- pg_cron: temp/ 配下の 24h 経過画像を毎日削除（orphan 安全網）
-- ===============================================
-- 通常時は image-gen-worker が Before 永続化に成功した瞬間に temp/ ファイルを
-- 同期削除するため、temp/ にはほぼ何も残らない。本 cron は worker 側で
-- 削除に失敗したケースの自動リカバリ（β: 24h TTL の安全網）。
--
-- pg_net で /functions/v1/cleanup-temp-images を 1 日 1 回（18:00 UTC = 03:00 JST）叩く。
-- ADR-003 / 計画書 §Phase 5 を参照。
-- 既存 style-template-cleanup-cron（20260502120500）と同じ Vault 経由 secret パターン。
--
-- 認証: Authorization ヘッダに専用 CRON_SECRET を載せる（Vault から取得）。
--   Vault に 'temp_image_cleanup_cron_secret' が存在しない場合は Authorization なしで起動する
--   （Edge Function 側 TEMP_IMAGE_CLEANUP_CRON_SECRET 未設定なら通過、
--    設定済なら 401 で空振り、いずれも DB に副作用なし）。
--
-- 本番デプロイ前チェックリスト:
--   1. Edge Function `cleanup-temp-images` を deploy（verify_jwt: false）
--   2. Edge Function Secrets に `TEMP_IMAGE_CLEANUP_CRON_SECRET` を設定
--   3. Supabase Vault に同じ値で `temp_image_cleanup_cron_secret` を保存:
--        SELECT vault.create_secret('<同じ値>', 'temp_image_cleanup_cron_secret');
--   4. 本マイグレーションを適用
--
-- key rotation 時は Vault 更新後に本マイグレーションを再実行する必要がある
-- （cron.job テーブルには展開後の文字列が保存されるため）。
--
-- 多環境運用時:
--   下記 v_function_url を環境別に書き換える必要あり（ステージング/開発で別 project_ref になる場合）。
--   現状は本番（AI coordinate）のみのため hnrccaxrvhtbuihfvitc を使用。

DO $do$
DECLARE
  v_existing_job_id BIGINT;
  v_function_url TEXT := 'https://hnrccaxrvhtbuihfvitc.supabase.co/functions/v1/cleanup-temp-images';
  v_cron_secret TEXT;
  v_headers JSONB;
  v_command TEXT;
BEGIN
  -- 既存 job があれば削除（再 apply 時の idempotency）
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'cleanup_temp_images_daily'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  -- Vault から CRON_SECRET を取得（未設定なら Authorization 省略）
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

  -- 1 日 1 回（18:00 UTC = 03:00 JST）に Edge Function を叩く
  -- timeout は 30 秒（バックログがある場合でも 1 回の関数内で BATCH_SIZE x SAFE_MAX_BATCHES まで処理）
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
    'cleanup_temp_images_daily',
    '0 18 * * *',
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
--   SELECT jobid INTO v_existing_job_id FROM cron.job WHERE jobname = 'cleanup_temp_images_daily' LIMIT 1;
--   IF v_existing_job_id IS NOT NULL THEN
--     PERFORM cron.unschedule(v_existing_job_id);
--   END IF;
-- END;
-- $do$;
-- ===============================================
