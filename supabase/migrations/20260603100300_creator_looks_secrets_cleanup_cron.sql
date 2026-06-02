-- ===============================================
-- pg_cron: 撤回された Creator Looks 投稿の secrets を 30 日後に物理削除
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md HI-006 (Security), Phase 7
--
-- 目的:
--   - クリエイターが投稿を `withdrawn` にした場合、紐づく user_style_template_secrets を
--     30 日後に物理削除する (= GDPR / 「忘れられる権利」対応)。
--   - withdrawn 直後に即削除しない理由:
--     1. 撤回ミスからの復旧余地を残す
--     2. 同一トランザクション内での副作用を増やさない
--
-- 判定基準:
--   - moderation_status = 'withdrawn' かつ moderation_updated_at < now() - interval '30 days'
--   - is_creator_looks = true
--   - user_style_template_secrets 行が残っている
--
-- 注意:
--   - moderation_updated_at は既存列 (= withdrawn 遷移時にも更新される、既存 trigger 設定)
--   - 削除する対象は secrets テーブルのみ (= user_style_templates 本体は手動削除に委ねる)
--   - 削除ログは style_template_audit_logs に action='extract_failed' とは別の意味で記録するが、
--     既存 CHECK 制約に新 action を追加すると影響が広がるため、metadata に event を埋める形に留める

BEGIN;

-- 削除関数本体 (pg_cron から呼ばれる SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.cleanup_withdrawn_creator_looks_secrets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_secret RECORD;
BEGIN
  -- 30 日以上前に撤回された Creator Looks 投稿の secret を 1 件ずつ削除
  -- (= 監査ログを per-row で残すため一括 DELETE ではなく FOR loop)
  FOR v_secret IN
    SELECT s.template_id, t.submitted_by_user_id
    FROM public.user_style_template_secrets s
    JOIN public.user_style_templates t ON t.id = s.template_id
    WHERE t.is_creator_looks = true
      AND t.moderation_status = 'withdrawn'
      AND t.moderation_updated_at IS NOT NULL
      AND t.moderation_updated_at < now() - interval '30 days'
  LOOP
    DELETE FROM public.user_style_template_secrets
    WHERE template_id = v_secret.template_id;

    v_deleted_count := v_deleted_count + 1;

    -- 監査: 削除した事実だけ記録 (= hidden_prompt は metadata に絶対含めない、ADR-009)
    BEGIN
      INSERT INTO public.style_template_audit_logs (
        template_id,
        actor_id,
        action,
        reason,
        metadata
      ) VALUES (
        v_secret.template_id,
        v_secret.submitted_by_user_id,
        'withdraw',
        'secrets_cleanup_30days',
        jsonb_build_object(
          'event', 'creator_looks_secrets_cleanup',
          'cleaned_at', now()
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- 監査ログ書き込み失敗は no-op (= 主目的の DELETE は成功している)
      RAISE WARNING 'cleanup_withdrawn_creator_looks_secrets: audit log insert failed for template %: %',
        v_secret.template_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_withdrawn_creator_looks_secrets() IS
  'Creator Looks 投稿が withdrawn になってから 30 日経過した secrets を物理削除する (HI-006 / GDPR 対応)';

REVOKE ALL ON FUNCTION public.cleanup_withdrawn_creator_looks_secrets() FROM PUBLIC, anon;

-- cron スケジュール (= 1 日 1 回、03:30 JST = 18:30 UTC)
-- 既存 temp-images-cleanup cron (18:00 UTC) と被らないよう 30 分ずらす
DO $do$
DECLARE
  v_existing_job_id BIGINT;
  v_new_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'creator_looks_secrets_cleanup_daily'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  v_new_job_id := cron.schedule(
    'creator_looks_secrets_cleanup_daily',
    '30 18 * * *',  -- 18:30 UTC = 03:30 JST 毎日
    'SELECT public.cleanup_withdrawn_creator_looks_secrets();'
  );

  -- Phase 7 では Vault secret / 本番運用が確定する Stage 1 後まで inactive 登録。
  -- Stage 1 公開時に手動 active 化する (= 30 日前に撤回された secret はそれまで残るので
  -- 影響なし、Phase 1 でテーブル作成直後にはそもそも対象 secrets が存在しない)。
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
--   SELECT jobid INTO v_existing_job_id FROM cron.job WHERE jobname = 'creator_looks_secrets_cleanup_daily' LIMIT 1;
--   IF v_existing_job_id IS NOT NULL THEN
--     PERFORM cron.unschedule(v_existing_job_id);
--   END IF;
-- END;
-- $do$;
-- DROP FUNCTION IF EXISTS public.cleanup_withdrawn_creator_looks_secrets();
-- COMMIT;
-- ===============================================
