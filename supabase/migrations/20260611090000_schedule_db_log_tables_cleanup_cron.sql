-- ===============================================
-- pg_cron: DB 内部ログテーブルの定期掃除 (Disk IO Budget 枯渇対策)
-- ===============================================
-- 背景 (2026-06-10 調査):
--   Supabase ダッシュボードで「Disk IO Budget をまもなく使い切る」警告が発生。
--   調査の結果、DB 全体 1,845 MB のうちアプリ本体のテーブルは約 20 MB のみで、
--   残りは以下の内部ログテーブルの肥大化だった:
--     - net._http_response  : 1,314 MB (生存行は約 2,000 行のみ = ほぼ dead space)
--     - cron.job_run_details:   479 MB (約 127 万行、自動掃除なし)
--   image-gen-worker-cron が 10 秒毎に net.http_post を呼ぶため、両テーブルは
--   放置すると際限なく成長する。さらに monitor_creator_looks_extract_failures()
--   が 5 分毎に net._http_response を seq scan しており、肥大化したファイルを
--   毎回ディスクから読むことが Disk IO 消費の主因だった。
--   (一次対応として両テーブルは 2026-06-10 に TRUNCATE 済み → DB 全体 52 MB に)
--
-- 再発防止 (このマイグレーション):
--   1. cron.job_run_details: 7 日より古い実行履歴を毎日削除
--      (Supabase 公式ドキュメント推奨のメンテナンスジョブ)
--   2. net._http_response: 行の削除自体は pg_net (v0.19.5) が TTL 6 時間で
--      自動実行するためジョブ不要。ただし dead space の再肥大化を防ぐ安全網
--      として週 1 回 VACUUM を実行する (= 空きページの再利用を促す)。
--      VACUUM はテーブルロックを取らないため運用影響なし。
--
-- 認証: いずれも DB 内部完結のメンテナンスのため追加認証不要。

-- cron.job_run_details の掃除 (毎日 19:00 UTC = JST 4:00、低トラフィック帯)
-- 既存 job が居れば削除して idempotent に
DO $do$
DECLARE
  v_existing_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'cleanup_cron_job_run_details_daily'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  -- start_time 基準で削除する (= クラッシュ等で end_time が NULL のまま残った
  -- 行も確実に掃除するため。start_time は常に記録される)
  PERFORM cron.schedule(
    'cleanup_cron_job_run_details_daily',
    '0 19 * * *',
    $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days'$$
  );
END;
$do$;

-- net._http_response の VACUUM (毎週日曜 19:30 UTC = JST 月曜 4:30)
-- NOTE: VACUUM はトランザクション内で実行できないため、pg_cron の
--       バックグラウンドワーカー経由で直接実行する (公式サポートパターン)。
-- 権限検証 (2026-06-11、本番 PostgreSQL 17.6 にて):
--   - postgres ロールでの VACUUM net._http_response → 成功
--     (cron ジョブも postgres ロールで実行されるため実行時エラーにならない)
--   - 代替案の ALTER TABLE net._http_response SET (autovacuum_*) は
--     「must be owner of table _http_response」(owner は supabase_admin) で
--     実行不可のため採用できない。週次 VACUUM はその範囲での安全網。
DO $do$
DECLARE
  v_existing_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'vacuum_net_http_response_weekly'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'vacuum_net_http_response_weekly',
    '30 19 * * 0',
    'VACUUM net._http_response'
  );
END;
$do$;

-- ===============================================
-- DOWN:
-- DO $do$
-- DECLARE
--   v_job_id BIGINT;
-- BEGIN
--   SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'cleanup_cron_job_run_details_daily' LIMIT 1;
--   IF v_job_id IS NOT NULL THEN
--     PERFORM cron.unschedule(v_job_id);
--   END IF;
--   SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'vacuum_net_http_response_weekly' LIMIT 1;
--   IF v_job_id IS NOT NULL THEN
--     PERFORM cron.unschedule(v_job_id);
--   END IF;
-- END;
-- $do$;
-- ===============================================
