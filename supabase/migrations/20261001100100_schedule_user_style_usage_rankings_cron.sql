-- ===============================================
-- pg_cron: /user-styles 👑「よく使われる」の順位を毎時確定する
-- ===============================================
-- 確定する関数: recompute_user_style_usage_rankings()(20261001100000)
--
-- 実行間隔: 毎時 25 分(2026-10-01 ユーザー決定: 1 時間ごと)。
-- 既存ジョブ(毎時 0 分 / 7 分 / 15 分、10 分ごと)と重ならない分に置く。
--
-- 登録直後から有効にする。🔥人気のプロンプト(20260902110100)は段階公開の Phase 4 まで
-- 動かさない方針で inactive 登録したが、こちらは画面の公開と独立した派生データの確定で、
-- 動かさないと読み出し側が常にライブ集計(1 ページだけ)へ倒れて目的を果たさないため。
-- 止めたくなったら次のコマンドで即座に止まる(順位は残り、3 時間後から
-- 読み出し側がライブ集計へフォールバックする):
--   SELECT cron.alter_job(
--     job_id := (SELECT jobid FROM cron.job WHERE jobname = 'recompute_user_style_usage_rankings_hourly'),
--     active := false
--   );
--
-- Edge Function は経由しない。再計算は DB 内で完結するため、pg_cron から
-- SQL を直接実行する。実行者は migration を流したロール (postgres) になるので、
-- recompute_user_style_usage_rankings() 側の is_trusted_lineage_writer() を満たす。

DO $do$
DECLARE
  v_existing_job_id BIGINT;
BEGIN
  -- 既存 job があれば削除（再 apply 時の idempotency）
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'recompute_user_style_usage_rankings_hourly'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'recompute_user_style_usage_rankings_hourly',
    '25 * * * *',
    'SELECT public.recompute_user_style_usage_rankings();'
  );
END;
$do$;

-- 初回の順位をすぐ確定させる(次の 25 分を待たずに、読み出し側が順位を使えるように)。
SELECT public.recompute_user_style_usage_rankings();

-- ===============================================
-- DOWN:
-- DO $do$
-- DECLARE
--   v_existing_job_id BIGINT;
-- BEGIN
--   SELECT jobid INTO v_existing_job_id FROM cron.job WHERE jobname = 'recompute_user_style_usage_rankings_hourly' LIMIT 1;
--   IF v_existing_job_id IS NOT NULL THEN
--     PERFORM cron.unschedule(v_existing_job_id);
--   END IF;
-- END;
-- $do$;
-- ===============================================
