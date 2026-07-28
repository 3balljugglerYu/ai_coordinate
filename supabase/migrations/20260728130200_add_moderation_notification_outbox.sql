-- ===============================================
-- モデレーション通知の transactional outbox と dispatcher
-- ===============================================
-- 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
--           ADR-001 / REQ-001, REQ-002, REQ-010
--
-- 【なぜ outbox にするか】
-- 「判定 RPC で removed 化 → API で notifications へ直 INSERT」方式だと、
-- 状態更新の後に通知 INSERT が失敗した場合、通知が永久に欠落する。
-- HTTP 再送時には逆に通知が重複する。削除通知は異議申立ての起点であり、
-- 欠落は投稿者の救済機会そのものを失わせるため許容できない。
--
-- そこで判定・監査ログ・通知要求 (outbox) を同一トランザクションで確定し、
-- 通知テーブルへの配送だけを再試行可能な副作用として分離する。
--
-- 【冪等性】
--   - outbox.event_key が UNIQUE (= 同じ判定から二重に通知要求が生まれない)
--   - notifications 側にも data->>'moderation_event_key' の部分 UNIQUE index
--     (= dispatcher が並行実行 / 再試行されても通知は1件)
--
-- 【通報者の匿名性 (ADR-011 / REQ-022, REQ-023)】
-- payload には policy_code / policy_version / policy_anchor /
-- author_facing_reason / moderation_decision_id のみを載せる。
-- internal_note・通報件数・通報者情報は載せない。
--
-- 【管理者の個人情報 (レビュー指摘10)】
-- author-facing notification の actor_id には recipient 本人の ID を設定し、
-- data.system_generated = true を立てる。実際の admin ID は payload にも
-- notifications にも含めない。

BEGIN;

CREATE TABLE IF NOT EXISTS public.moderation_notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 冪等キー。'removal:{decision_id}' / 'appeal:{appeal_id}' の形式
  event_key TEXT NOT NULL UNIQUE,
  moderation_decision_id UUID REFERENCES public.moderation_audit_logs(id) ON DELETE CASCADE,
  appeal_id UUID,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (
    notification_type IN ('post_moderation_removed', 'post_moderation_appeal_result')
  ),
  entity_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    delivery_status IN ('pending', 'delivered', 'dead')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- delivered なら delivered_at が入る、それ以外は NULL
  CONSTRAINT moderation_outbox_delivered_at_check CHECK (
    (delivery_status = 'delivered' AND delivered_at IS NOT NULL)
    OR (delivery_status <> 'delivered' AND delivered_at IS NULL)
  )
);

-- dispatcher の取り出し用。未配送を古い順に引く。
CREATE INDEX IF NOT EXISTS idx_moderation_outbox_pending
  ON public.moderation_notification_outbox (available_at)
  WHERE delivery_status = 'pending';

-- 申立期限の算出用 (removal outbox の delivered_at から14日)
CREATE INDEX IF NOT EXISTS idx_moderation_outbox_decision
  ON public.moderation_notification_outbox (moderation_decision_id);

COMMENT ON TABLE public.moderation_notification_outbox IS
  'モデレーション通知の transactional outbox。判定と同一トランザクションで記録し、dispatcher が冪等に notifications へ配送する (ADR-001)。';
COMMENT ON COLUMN public.moderation_notification_outbox.payload IS
  '投稿者に開示してよい項目のみ。internal_note / 通報件数 / 通報者情報を含めてはならない (ADR-011)。';

-- RLS: 公開 policy を一切作らない (= service_role と SECURITY DEFINER のみ)
ALTER TABLE public.moderation_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moderation_notification_outbox FROM PUBLIC, anon, authenticated;

-- ===============================================
-- dispatcher
-- ===============================================
-- pending 行を FOR UPDATE SKIP LOCKED で取り出し、1行ずつ notifications へ
-- UPSERT する。行ごとに EXCEPTION ブロックを持ち、1件の失敗が他行や
-- トランザクション全体を巻き込まないようにする。
CREATE OR REPLACE FUNCTION public.dispatch_moderation_notification_outbox(
  p_limit INTEGER DEFAULT 50
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_delivered INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT *
    FROM public.moderation_notification_outbox
    WHERE delivery_status = 'pending'
      AND available_at <= now()
    ORDER BY available_at
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- actor_id には recipient 本人を入れる (= admin の個人情報を投稿者に渡さない)。
      -- create_notification は self-skip するため経由せず直接 INSERT する。
      INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        type,
        entity_type,
        entity_id,
        title,
        body,
        data
      ) VALUES (
        v_row.recipient_id,
        v_row.recipient_id,
        v_row.notification_type,
        'post',
        v_row.entity_id,
        COALESCE(v_row.payload->>'fallback_title', 'モデレーションのお知らせ'),
        COALESCE(v_row.payload->>'fallback_body', ''),
        v_row.payload
          || jsonb_build_object(
               'moderation_event_key', v_row.event_key,
               'system_generated', true
             )
      )
      ON CONFLICT DO NOTHING;

      UPDATE public.moderation_notification_outbox
      SET delivery_status = 'delivered',
          delivered_at = now(),
          attempt_count = attempt_count + 1,
          last_error = NULL
      WHERE id = v_row.id;

      v_delivered := v_delivered + 1;

    EXCEPTION WHEN OTHERS THEN
      -- 指数バックオフ (最大1時間)。pending のまま次回 cron で再試行する。
      UPDATE public.moderation_notification_outbox
      SET attempt_count = attempt_count + 1,
          last_error = SQLERRM,
          available_at = now() + LEAST(
            interval '1 hour',
            (interval '1 minute') * POWER(2, LEAST(attempt_count, 6))
          )
      WHERE id = v_row.id;
    END;
  END LOOP;

  RETURN v_delivered;
END;
$$;

COMMENT ON FUNCTION public.dispatch_moderation_notification_outbox(INTEGER) IS
  'outbox から未配送のモデレーション通知を冪等に配送する。pg_cron と判定 API の best-effort 呼び出しの両方から実行される (ADR-001)。';

REVOKE ALL ON FUNCTION public.dispatch_moderation_notification_outbox(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_moderation_notification_outbox(INTEGER)
  TO service_role;

-- ===============================================
-- cron 登録 (1分ごとの再試行)
-- ===============================================
-- 既存 creator_looks_secrets_cleanup_daily と同じ「既存 job を unschedule して
-- から schedule し直す」冪等パターンを踏襲する。
DO $do$
DECLARE
  v_existing_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'moderation_notification_outbox_dispatch'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'moderation_notification_outbox_dispatch',
    '* * * * *',  -- 毎分
    'SELECT public.dispatch_moderation_notification_outbox(50);'
  );
END;
$do$;

COMMIT;

-- ===============================================
-- DOWN:
-- 配送を止めるだけなら cron job を無効化する (outbox データは保持する):
--   SELECT cron.alter_job(
--     job_id := (SELECT jobid FROM cron.job WHERE jobname = 'moderation_notification_outbox_dispatch'),
--     active := false
--   );
--
-- 完全に戻す場合 (未配送データの保全確認後にのみ実施):
-- BEGIN;
-- SELECT cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'moderation_notification_outbox_dispatch'));
-- DROP FUNCTION IF EXISTS public.dispatch_moderation_notification_outbox(INTEGER);
-- DROP TABLE IF EXISTS public.moderation_notification_outbox;
-- COMMIT;
-- ===============================================
