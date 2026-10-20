-- クリエイター還元(usage_reward_earned)のプッシュを 1 日 1 通にする
--
-- この通知は受け手×JST日付で 1 行にまとめ、利用のたびに created_at を進めて
-- 書き足す(20260806160000)。これまでは書き足すたびにプッシュも積んでいたため、
-- 人気の作品を持つ人には 1 日に何通も届いていた。お知らせ画面と同じく 1 日 1 件に
-- そろえ、その日の最初の 1 回(INSERT)だけ積む。
--
-- 変えるのは enqueue_push_for_notification の分岐 1 つだけ。トリガーと
-- ほかの type の挙動は 20261013120100 のまま。

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.enqueue_push_for_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_category TEXT;
  v_send_after TIMESTAMPTZ := now() + interval '30 seconds';
BEGIN
  -- 通知の記録そのものを止めないよう、ここでの失敗は握る
  BEGIN
    v_category := public.push_category_for_notification_type(NEW.type);
    IF v_category IS NULL THEN
      RETURN NULL;
    END IF;

    -- 宛先の無い人の分は積まない
    IF NOT EXISTS (
      SELECT 1 FROM public.push_device_tokens WHERE user_id = NEW.recipient_id
    ) THEN
      RETURN NULL;
    END IF;

    -- クリエイター還元は 1 日(JST)1 行の通知を、利用のたびに書き足す。
    -- プッシュはその日の最初の 1 通だけにする(INSERT の時だけ積む)。
    -- 送る前の行があれば、送る時に最新の回数を読むので、何もしなくてよい
    IF TG_OP = 'UPDATE' AND NEW.type = 'usage_reward_earned' THEN
      RETURN NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      UPDATE public.push_outbox o
      SET send_after = LEAST(v_send_after, o.created_at + interval '5 minutes')
      WHERE o.notification_id = NEW.id
        AND o.status = 'pending';
      IF FOUND THEN
        RETURN NULL;
      END IF;
    END IF;

    INSERT INTO public.push_outbox (
      recipient_id, category, notification_id, collapse_key, send_after
    ) VALUES (
      NEW.recipient_id,
      v_category,
      NEW.id,
      CASE WHEN NEW.type = 'like' THEN 'like:' || NEW.entity_id::TEXT END,
      v_send_after
    )
    ON CONFLICT (notification_id)
      WHERE notification_id IS NOT NULL AND status IN ('pending', 'processing')
      DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_push_for_notification failed for notification %: %',
      NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_push_for_notification()
  FROM PUBLIC, anon, authenticated;

COMMIT;
