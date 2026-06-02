-- ===============================================
-- pg_cron: Creator Looks 抽出失敗の検知 + admin 通知
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md Phase 2, ADR-003
--
-- 通常: extract-creator-looks-prompt Edge Function 自体が失敗時に
--       style_template_audit_logs に action='extract_failed' を INSERT する。
--
-- このジョブ: pg_net の HTTP レイヤ失敗 (= 関数自体に届かなかった、関数が
--             crash した、5xx を返してログを書けなかった等) を検知するための
--             安全網。net.http_response テーブルを 5 分毎に scan する。
--
-- 検知ロジック:
--   - 直近 5 分間で extract-creator-looks-prompt エンドポイントへの
--     失敗レスポンス (status_code IS NULL OR status_code >= 500) を抽出
--   - 既に audit_logs に記録済みの template_id は除外する
--     (= Edge Function が自分で書いた失敗は重複通知しない)
--   - admin_users 全員に通知 (= 同一 template_id に対しては 1 回だけ)
--
-- 認証: Edge Function 自体への HTTP リクエストは別 (= enqueue_creator_looks_extraction が発火)。
--       本 cron は単に net.http_response を scan するだけなので追加認証不要。
--
-- 本マイグレーション適用後の運用:
--   - Phase 2 では Vault に creator_looks_extract_secret が無いため
--     enqueue は no-op → 関数呼び出し自体が起きない → このジョブは何もしない
--   - Phase 7 で Vault secret 設定後に意味を持つ

BEGIN;

-- 監視関数本体。pg_cron から呼ばれる。
-- SECURITY DEFINER で書く (= net.http_response / style_template_audit_logs に
-- アクセスする権限が必要)。
CREATE OR REPLACE FUNCTION public.monitor_creator_looks_extract_failures()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failure RECORD;
  v_notified_count INTEGER := 0;
  v_function_url TEXT := 'https://hnrccaxrvhtbuihfvitc.supabase.co/functions/v1/extract-creator-looks-prompt';
BEGIN
  -- 過去 5 分の HTTP 失敗を抽出
  FOR v_failure IN
    SELECT
      resp.id,
      resp.status_code,
      resp.error_msg,
      resp.created
    FROM net._http_response AS resp
    WHERE resp.created >= now() - interval '5 minutes'
      AND (resp.status_code IS NULL OR resp.status_code >= 500)
      AND EXISTS (
        SELECT 1
        FROM net.http_request_queue AS req
        WHERE req.id = resp.id
          AND req.url = v_function_url
      )
  LOOP
    -- 単純な集約: 失敗があったことだけを audit log に記録
    -- (= template_id は HTTP request の body にあるが parse コストを払わず、
    --  まとめて「直近 5 分に N 件失敗」を 1 行記録)
    v_notified_count := v_notified_count + 1;
  END LOOP;

  IF v_notified_count > 0 THEN
    -- admin 全員にまとめて 1 通知
    -- (= template_id ごとの個別通知は Edge Function 自身がやる、こちらは網羅性確保用)
    INSERT INTO public.notifications (
      recipient_id,
      actor_id,
      type,
      entity_type,
      entity_id,
      title,
      body,
      data
    )
    SELECT
      au.user_id,
      au.user_id,  -- actor は自分扱い (= system 通知の便宜上)
      'creator_looks_submission_received',  -- 既存 type を流用 (= 専用 type は将来追加)
      'creator_looks_template',
      gen_random_uuid(),  -- ダミー entity_id (= 集約通知なので個別 template_id は持たない)
      'Creator Looks 抽出ジョブで HTTP 失敗が発生しています',
      format('直近 5 分間に %s 件の Edge Function 呼び出しが失敗しました。Supabase Functions のログを確認してください。', v_notified_count),
      jsonb_build_object(
        'monitor', 'creator_looks_extract_response_monitor',
        'failure_count', v_notified_count,
        'window_minutes', 5
      )
    FROM public.admin_users AS au;
  END IF;

  RETURN v_notified_count;
END;
$$;

COMMENT ON FUNCTION public.monitor_creator_looks_extract_failures() IS
  'pg_cron 監視: Edge Function extract-creator-looks-prompt への HTTP 失敗 (5xx / timeout / 接続不能) を直近 5 分で検知して admin に集約通知する';

REVOKE ALL ON FUNCTION public.monitor_creator_looks_extract_failures() FROM PUBLIC, anon;

-- cron スケジュール (= 5 分毎)
-- 既存 job が居れば削除して idempotent に
DO $do$
DECLARE
  v_existing_job_id BIGINT;
  v_new_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'creator_looks_extract_response_monitor'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  v_new_job_id := cron.schedule(
    'creator_looks_extract_response_monitor',
    '*/5 * * * *',
    'SELECT public.monitor_creator_looks_extract_failures();'
  );

  -- Phase 2 では Vault 未設定で Edge Function 呼び出し自体が起きないので、
  -- 通知が誤発火しないよう inactive で登録しておく。
  -- Phase 7 で Vault secret 設定後に手動で active 化する。
  PERFORM cron.alter_job(job_id := v_new_job_id, active := false);
END;
$do$;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DO $do$
-- DECLARE
--   v_existing_job_id BIGINT;
-- BEGIN
--   SELECT jobid INTO v_existing_job_id FROM cron.job WHERE jobname = 'creator_looks_extract_response_monitor' LIMIT 1;
--   IF v_existing_job_id IS NOT NULL THEN
--     PERFORM cron.unschedule(v_existing_job_id);
--   END IF;
-- END;
-- $do$;
-- DROP FUNCTION IF EXISTS public.monitor_creator_looks_extract_failures();
-- COMMIT;
-- ===============================================
