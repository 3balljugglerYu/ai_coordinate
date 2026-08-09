-- ===============================================
-- Disk IO 削減: ワーカー起動 cron の間隔緩和 + 実行ログ保持の最適化
-- ===============================================
-- 背景 (2026-08-09 障害):
--   Disk IO Budget 枯渇により DB が完全無応答となり、サービスが停止した
--   (compute を Nano→Small へ引き上げて復旧)。
--   同種の警告は 2026-06-10 にも発生しており
--   (20260611090000_schedule_db_log_tables_cleanup_cron.sql)、そのときは
--   肥大化した内部ログテーブルの掃除という「症状」への対処だった。
--   本マイグレーションは残っていた根本原因である「常時ポーリングの書き込み量」
--   に対処する。
--
-- 実測 (直近7日 / 426 ジョブ):
--   - 生成所要時間: 平均 32.0 秒 / 中央値 31.6 秒 / p90 38.6 秒
--   - 作成→処理開始の待ち時間:
--       2 秒未満  387 件 (91%)  ... アプリからの直接起動で拾えている
--       2-12 秒    20 件 (4.7%) ... cron が拾った分 (= cron の実効価値)
--       62 秒以上  17 件 (4%)   ... リトライ経路 (可視性タイムアウト後)
--   → 1 日 8,640 回のポーリングで実際に救っているのは 1 日 3 件程度。
--
-- 変更 1: image-gen-worker-cron を 10 秒 → 30 秒
--   通常の生成はアプリ側 (generate-async handler) が受付時にワーカーを直接
--   起動しており、cron は「直接起動が失敗した場合」と「リトライの拾い上げ」の
--   保険。間隔を 3 倍にしても 91% のジョブには影響せず、cron に拾われる
--   約 5% の待ちが最大 10 秒 → 最大 30 秒 になるのみ(生成自体が約 32 秒の
--   サービスであり許容範囲)。ポーリングは 1 日 8,640 回 → 2,880 回。
--   1 回ごとに cron.job_run_details / net._http_request_queue /
--   net._http_response へ行が書かれるため、書き込み量は約 1/3 になる。
--
-- 変更 2: cron.job_run_details の保持を「一律 7 日」→ ジョブ別
--   実測の内訳: image-gen-worker-cron 81.3% / moderation dispatch 13.6%
--   (上位 2 つで 95%)。高頻度ジョブのログだけ 1 日で捨て、それ以外は
--   30 日保持する。一律短縮より削除量は同等のまま、月次ジョブ
--   (expire_free_percoin_monthly 等) の実行記録を監査目的で残せる。

BEGIN;

-- ---------------------------------------------
-- 変更 1: ワーカー起動 cron の間隔緩和
-- ---------------------------------------------
-- command は変更しないため alter_job で schedule のみ差し替える
-- (unschedule + schedule だと command の写し間違いが事故になりうる)。
DO $do$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'image-gen-worker-cron'
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'image-gen-worker-cron が見つかりません (想定外の構成)';
  END IF;

  PERFORM cron.alter_job(v_job_id, schedule := '30 seconds');
END;
$do$;

-- ---------------------------------------------
-- 変更 2: 実行ログの保持期間をジョブ別にする
-- ---------------------------------------------
-- 高頻度ポーリング系は 1 日、それ以外は 30 日。
-- 対象ジョブが unschedule 済みで cron.job に存在しない場合の孤児行も、
-- 30 日側の条件で回収される。
CREATE OR REPLACE FUNCTION public.cleanup_cron_job_run_details()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- 実行ログの 95% を占める高頻度ジョブ。増えたらここに足す。
  v_noisy_job_names TEXT[] := ARRAY[
    'image-gen-worker-cron',
    'moderation_notification_outbox_dispatch'
  ];
  v_noisy_job_ids BIGINT[];
BEGIN
  SELECT array_agg(jobid) INTO v_noisy_job_ids
  FROM cron.job
  WHERE jobname = ANY(v_noisy_job_names);

  IF v_noisy_job_ids IS NOT NULL THEN
    DELETE FROM cron.job_run_details
    WHERE jobid = ANY(v_noisy_job_ids)
      AND start_time < now() - interval '1 day';
  END IF;

  -- 高頻度ジョブ以外 (および孤児行) は 30 日保持
  DELETE FROM cron.job_run_details
  WHERE (v_noisy_job_ids IS NULL OR jobid <> ALL(v_noisy_job_ids))
    AND start_time < now() - interval '30 days';
END;
$$;

COMMENT ON FUNCTION public.cleanup_cron_job_run_details() IS
  'pg_cron 実行ログの掃除。高頻度ポーリング系は 1 日、それ以外は 30 日保持する。';

REVOKE ALL ON FUNCTION public.cleanup_cron_job_run_details() FROM PUBLIC;

-- 既存の一律 7 日削除ジョブを、上の関数呼び出しに差し替える
DO $do$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'cleanup_cron_job_run_details_daily'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  -- 毎日 19:00 UTC = JST 4:00 (低トラフィック帯。従来と同じ時刻)
  PERFORM cron.schedule(
    'cleanup_cron_job_run_details_daily',
    '0 19 * * *',
    $$SELECT public.cleanup_cron_job_run_details()$$
  );
END;
$do$;

-- 溜まっている分は次回の定期実行を待たずここで一度掃除する
SELECT public.cleanup_cron_job_run_details();

-- ---------------------------------------------
-- 検証
-- ---------------------------------------------
DO $do$
DECLARE
  v_schedule TEXT;
  v_cleanup_command TEXT;
  v_remaining BIGINT;
BEGIN
  SELECT schedule INTO v_schedule
  FROM cron.job WHERE jobname = 'image-gen-worker-cron';
  IF v_schedule IS DISTINCT FROM '30 seconds' THEN
    RAISE EXCEPTION 'ワーカー cron の間隔が想定と異なります: %', v_schedule;
  END IF;

  SELECT command INTO v_cleanup_command
  FROM cron.job WHERE jobname = 'cleanup_cron_job_run_details_daily';
  IF v_cleanup_command NOT LIKE '%cleanup_cron_job_run_details%' THEN
    RAISE EXCEPTION '掃除ジョブが差し替わっていません: %', v_cleanup_command;
  END IF;

  SELECT count(*) INTO v_remaining FROM cron.job_run_details;
  RAISE NOTICE 'OK: ワーカー cron=30 秒 / 掃除ジョブ差し替え済み / 実行ログ残 % 行', v_remaining;
END;
$do$;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DO $do$
-- DECLARE v_job_id BIGINT;
-- BEGIN
--   SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'image-gen-worker-cron' LIMIT 1;
--   IF v_job_id IS NOT NULL THEN
--     PERFORM cron.alter_job(v_job_id, schedule := '10 seconds');
--   END IF;
--   SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'cleanup_cron_job_run_details_daily' LIMIT 1;
--   IF v_job_id IS NOT NULL THEN
--     PERFORM cron.unschedule(v_job_id);
--   END IF;
--   PERFORM cron.schedule(
--     'cleanup_cron_job_run_details_daily',
--     '0 19 * * *',
--     $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days'$$
--   );
-- END;
-- $do$;
-- DROP FUNCTION IF EXISTS public.cleanup_cron_job_run_details();
-- COMMIT;
-- ===============================================
