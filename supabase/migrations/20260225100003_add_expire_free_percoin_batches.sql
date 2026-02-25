-- expire_free_percoin_batches 関数作成 + pg_cron 登録
-- 毎月1日 JST 09:05（UTC 00:05）に無償ペルコインの月次失効を実行

CREATE OR REPLACE FUNCTION public.expire_free_percoin_batches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. 失効対象を確定しロック、ログに記録（既にログ済みの batch_id は除外）
  WITH expired AS (
    SELECT fpb.id, fpb.user_id, fpb.amount, fpb.remaining_amount, fpb.granted_at, fpb.expire_at, fpb.source
    FROM free_percoin_batches fpb
    WHERE fpb.expire_at < now() AND fpb.remaining_amount > 0
      AND NOT EXISTS (SELECT 1 FROM free_percoin_expiration_log l WHERE l.batch_id = fpb.id)
    FOR UPDATE
  )
  INSERT INTO free_percoin_expiration_log (batch_id, user_id, amount_expired, original_amount, granted_at, expire_at, source, reason)
  SELECT id, user_id, remaining_amount, amount, granted_at, expire_at, source, 'monthly_expiration'
  FROM expired;

  -- 2. user_credits を一括減算（expiration_log に挿入した集合を基準）
  UPDATE user_credits uc
  SET balance = balance - e.total_expired, updated_at = now()
  FROM (
    SELECT l.user_id, SUM(l.amount_expired) AS total_expired
    FROM free_percoin_expiration_log l
    WHERE l.batch_id IN (SELECT id FROM free_percoin_batches WHERE expire_at < now() AND remaining_amount > 0)
    GROUP BY l.user_id
  ) e
  WHERE uc.user_id = e.user_id;

  -- 3. バッチ削除（expiration_log に記録済みのバッチのみ）
  DELETE FROM free_percoin_batches fpb
  WHERE fpb.expire_at < now() AND fpb.remaining_amount > 0
    AND EXISTS (SELECT 1 FROM free_percoin_expiration_log l WHERE l.batch_id = fpb.id);
END;
$$;

-- pg_cron 登録（毎月1日 00:05 UTC = JST 09:05）
DO $do$
DECLARE
  v_existing_job_id bigint;
BEGIN
  SELECT jobid
  INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'expire_free_percoin_monthly'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'expire_free_percoin_monthly',
    '5 0 1 * *',
    $cron$SELECT public.expire_free_percoin_batches();$cron$
  );
END;
$do$;
