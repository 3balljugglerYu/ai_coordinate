-- ===============================================
-- pg_cron: 🔥人気のプロンプトの順位を毎時再計算する
-- ===============================================
-- 計画書: docs/planning/popular-prompts-tab-implementation-plan.md (Phase 1 / Phase 4)
--
-- 運用ポリシー:
--   既存の cleanup_temp_images_daily (20260503120100) と同じく、
--   **登録直後に inactive 化する**。実際に動かすのは Phase 4 で、
--   ユーザー承認を得てから次のコマンドで有効化する:
--     SELECT cron.alter_job(
--       job_id := (SELECT jobid FROM cron.job WHERE jobname = 'recompute_popular_prompts_hourly'),
--       active := true
--     );
--   止めたくなったら同じコマンドの active := false で即座に止まる。
--   順位テーブルは残るが、読み出し側の鮮度チェックが働いて新着順に倒れる。
--
-- Edge Function は経由しない。再計算は DB 内で完結するため、pg_cron から
-- SQL を直接実行する (Vault の secret も pg_net も要らない)。
-- 実行者は migration を流したロール (postgres) になるので、
-- recompute_popular_prompts() 側の is_trusted_lineage_writer() を満たす。
--
-- 実行間隔: 毎時 15 分。既存ジョブ (毎時 0 分 / 7 分) と重ならない分に置く。
-- 新着枠の反映は最大 1 時間遅れるが、初回利用の中央値が 6 時間なので許容する
-- (計画書 §9-1)。

DO $do$
DECLARE
  v_existing_job_id BIGINT;
  v_new_job_id BIGINT;
BEGIN
  -- 既存 job があれば削除（再 apply 時の idempotency）
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'recompute_popular_prompts_hourly'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  v_new_job_id := cron.schedule(
    'recompute_popular_prompts_hourly',
    '15 * * * *',
    'SELECT public.recompute_popular_prompts();'
  );

  -- 上記運用ポリシーに従い、登録直後に inactive 化する。
  -- 再 apply で active が true に戻ることがないよう、本マイグレーション内で常に false に戻す。
  -- cron.job への直接 UPDATE は supabase_admin にも許可されないため、公式 API の
  -- cron.alter_job(jobid, active := boolean) を使う（pg_cron 1.4+）。
  PERFORM cron.alter_job(job_id := v_new_job_id, active := false);
END;
$do$;

-- ===============================================
-- DOWN:
-- DO $do$
-- DECLARE
--   v_existing_job_id BIGINT;
-- BEGIN
--   SELECT jobid INTO v_existing_job_id FROM cron.job WHERE jobname = 'recompute_popular_prompts_hourly' LIMIT 1;
--   IF v_existing_job_id IS NOT NULL THEN
--     PERFORM cron.unschedule(v_existing_job_id);
--   END IF;
-- END;
-- $do$;
-- ===============================================
