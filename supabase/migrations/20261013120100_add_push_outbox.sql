-- ===============================================
-- アプリのプッシュ通知: 送信待ち (push_outbox) と、それを積む・起こす仕組み
-- ===============================================
-- 計画書: docs/planning/push-notifications-implementation-plan.md
--         Phase 1 / ADR-002, ADR-003, ADR-004, ADR-007
--         REQ-001, REQ-002, REQ-003, REQ-006, REQ-014, REQ-015
--
-- 【流れ】
--   notifications に行が増える → トリガーで push_outbox に積む(30 秒後に送る)
--   image_jobs が succeeded / failed になる → すぐ送る分を積み、その場で起こす
--   pg_cron(10 秒ごと) → push_outbox_kick(): 送る時刻を過ぎた行がある時だけ
--   Edge Function send-push を net.http_post で呼ぶ
--   send-push → claim_push_outbox() で確保 → 設定を判定して FCM へ → finish_push_outbox()
--
-- 【取り消し(REQ-002)】
-- いいね取り消し・フォロー解除・コメント削除・投稿の取り下げは、既に
-- notifications の行を物理削除している(20251214185550 ほか)。
-- push_outbox.notification_id を ON DELETE CASCADE にすることで、30 秒の間に
-- 取り消されたものは送信待ちごと消え、送られない。
--
-- 【過去分は送らない(ADR-004 / REQ-014)】
-- notifications.push_status は本番 9,060 行がすべて 'pending' のまま
-- (2026-10-13 実測)。このマイグレーション以後にトリガーで積んだ分だけを送り、
-- notifications.push_status / pushed_at は使わない。
--
-- 【負荷(ADR-003)】
-- 高頻度ポーリングは Disk IO 枯渇の一因になった(20260809120000)。
-- 10 秒ごとの確認は索引だけを見て、送るものがある時だけ net.http_post する。
-- ジョブは cleanup_cron_job_run_details の高頻度一覧に足す。
--
-- 【Phase 2 より前】
-- Vault の push_send_secret が無い間は push_outbox_kick は何もしない
-- (積まれた行は送られずに残る)。送信関数ができてから秘密を登録して動かす。

BEGIN;

-- -----------------------------------------------
-- push_outbox
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- push_preferences の種類(push_category_default が知っているもの)
  category TEXT NOT NULL CHECK (public.push_category_default(category) IS NOT NULL),
  -- 元の通知。消えたら送信待ちも消える(取り消し)
  notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
  -- 生成完了・失敗(通知タブには載せない)
  image_job_id UUID REFERENCES public.image_jobs(id) ON DELETE CASCADE,
  -- 同じ値の行は1通にまとめる(例: 'like:{投稿ID}')
  collapse_key TEXT,
  -- notifications を持たない送信(生成完了など)の表示文
  title TEXT,
  body TEXT,
  -- 押したときの行き先などをアプリに渡す値
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  send_after TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'sent', 'skipped', 'failed')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 元が1つだけ
  CONSTRAINT push_outbox_single_source_check CHECK (
    num_nonnulls(notification_id, image_job_id) <= 1
  )
);

-- 取り出し用(送る時刻を過ぎた未送信)
CREATE INDEX IF NOT EXISTS idx_push_outbox_due
  ON public.push_outbox (send_after)
  WHERE status = 'pending';

-- 確保したまま止まった行の回収用
CREATE INDEX IF NOT EXISTS idx_push_outbox_processing
  ON public.push_outbox (claimed_at)
  WHERE status = 'processing';

-- 同じ通知・同じ生成について、送る前の行は1つだけ
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_outbox_open_notification
  ON public.push_outbox (notification_id)
  WHERE notification_id IS NOT NULL AND status IN ('pending', 'processing');

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_outbox_image_job
  ON public.push_outbox (image_job_id)
  WHERE image_job_id IS NOT NULL;

-- 古い行の掃除用
CREATE INDEX IF NOT EXISTS idx_push_outbox_finished
  ON public.push_outbox (finished_at)
  WHERE status IN ('sent', 'skipped', 'failed');

COMMENT ON TABLE public.push_outbox IS
  'プッシュ通知の送信待ち。notifications に紐づく行は元の通知が消えると消える(取り消し)。service role と SECURITY DEFINER だけが扱う (ADR-002)。';

ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_outbox FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------
-- 通知の type → プッシュの種類
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.push_category_for_notification_type(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_type = 'like' THEN 'likes'
    WHEN p_type = 'comment' THEN 'comments'
    WHEN p_type = 'follow' THEN 'follows'
    WHEN p_type IN (
      'derived_post_published',
      'derived_usage_milestone',
      'style_preset_post_published',
      'style_preset_usage_milestone',
      'creator_looks_post_published'
    ) THEN 'creator_activity'
    WHEN p_type IN ('bonus', 'usage_reward_earned') THEN 'percoin'
    WHEN p_type IN (
      'style_template_approved',
      'style_template_rejected',
      'style_template_unpublished',
      'catalog_entry_approved',
      'catalog_entry_rejected',
      'catalog_entry_unpublished',
      'creator_looks_submission_received',
      'creator_looks_submission_acknowledged',
      'creator_looks_moderation_result',
      'post_moderation_removed',
      'post_moderation_appeal_result'
    ) THEN 'moderation'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.push_category_for_notification_type(TEXT) IS
  '通知の type をプッシュの種類に対応させる(計画書 §0)。NULL はプッシュしない type。type を足したらここにも足す。';

-- -----------------------------------------------
-- 通知が記録されたら積む(30 秒後)
-- -----------------------------------------------
-- いいね・フォローは一意制約に当たると INSERT ではなく UPDATE で created_at を
-- 進める(create_notification)。usage_reward_earned も UPSERT で created_at を
-- 進める。どちらも「新しく届いた」扱いにして、送る前の行があれば送る時刻を
-- 延ばし、無ければ積み直す。
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

    IF TG_OP = 'UPDATE' THEN
      UPDATE public.push_outbox
      SET send_after = v_send_after
      WHERE notification_id = NEW.id
        AND status = 'pending';
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

DROP TRIGGER IF EXISTS trg_enqueue_push_on_notification_insert ON public.notifications;
CREATE TRIGGER trg_enqueue_push_on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_push_for_notification();

DROP TRIGGER IF EXISTS trg_enqueue_push_on_notification_renewed ON public.notifications;
CREATE TRIGGER trg_enqueue_push_on_notification_renewed
  AFTER UPDATE OF created_at ON public.notifications
  FOR EACH ROW
  WHEN (NEW.created_at > OLD.created_at)
  EXECUTE FUNCTION public.enqueue_push_for_notification();

-- -----------------------------------------------
-- 送信関数を起こす
-- -----------------------------------------------
-- 送る時刻を過ぎた行がある時だけ net.http_post する。秘密が無い間は何もしない。
CREATE OR REPLACE FUNCTION public.push_outbox_kick()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret TEXT;
  v_function_url TEXT := 'https://hnrccaxrvhtbuihfvitc.supabase.co/functions/v1/send-push';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.push_outbox
    WHERE status = 'pending'
      AND send_after <= now()
  ) AND NOT EXISTS (
    -- 確保したまま 5 分止まっている行(送信関数が落ちた)も起こす理由にする
    SELECT 1
    FROM public.push_outbox
    WHERE status = 'processing'
      AND claimed_at < now() - interval '5 minutes'
  ) THEN
    RETURN false;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'push_send_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  IF v_secret IS NULL OR v_secret = '' THEN
    -- Phase 2(送信関数)の前。積んだ行はそのまま残る
    RETURN false;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      body := '{}'::JSONB,
      timeout_milliseconds := 30000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push_outbox_kick: net.http_post failed: %', SQLERRM;
    RETURN false;
  END;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.push_outbox_kick() IS
  '送る時刻を過ぎた送信待ちがある時だけ Edge Function send-push を起こす (ADR-003)。pg_cron(10 秒ごと)と生成完了のトリガーから呼ばれる。';

REVOKE ALL ON FUNCTION public.push_outbox_kick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_outbox_kick() TO service_role;

-- -----------------------------------------------
-- 生成が完了・失敗したら、待たずに送る(通知タブには載せない)
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_push_for_image_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_succeeded BOOLEAN := NEW.status = 'succeeded';
BEGIN
  BEGIN
    -- 未ログインの生成(ゲスト)には宛先が無い
    IF NEW.user_id IS NULL THEN
      RETURN NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.push_device_tokens WHERE user_id = NEW.user_id
    ) THEN
      RETURN NULL;
    END IF;

    INSERT INTO public.push_outbox (
      recipient_id, category, image_job_id, title, body, data, send_after
    ) VALUES (
      NEW.user_id,
      'generation',
      NEW.id,
      CASE WHEN v_succeeded THEN '画像が完成しました' ELSE '画像を生成できませんでした' END,
      CASE
        WHEN v_succeeded THEN 'タップして確認しましょう'
        ELSE 'タップして、もう一度お試しください'
      END,
      jsonb_build_object(
        'kind', 'generation',
        'image_job_id', NEW.id,
        'status', NEW.status,
        'generation_type', NEW.generation_type
      ),
      now()
    )
    ON CONFLICT (image_job_id) WHERE image_job_id IS NOT NULL DO NOTHING;

    -- pg_net は確定後に送るので、確定前の行を送ることはない
    PERFORM public.push_outbox_kick();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_push_for_image_job failed for job %: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_push_for_image_job()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enqueue_push_on_image_job_finished ON public.image_jobs;
CREATE TRIGGER trg_enqueue_push_on_image_job_finished
  AFTER UPDATE OF status ON public.image_jobs
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status IN ('succeeded', 'failed')
  )
  EXECUTE FUNCTION public.enqueue_push_for_image_job();

-- -----------------------------------------------
-- 送信関数が使う: 確保と結果の記録
-- -----------------------------------------------
-- 送る時刻を過ぎた行(と、確保したまま 5 分止まった行)を確保して返す。
-- 元の通知の中身(表示文・行き先)も一緒に返す。
CREATE OR REPLACE FUNCTION public.claim_push_outbox(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  id UUID,
  recipient_id UUID,
  category TEXT,
  collapse_key TEXT,
  title TEXT,
  body TEXT,
  data JSONB,
  attempt_count INTEGER,
  notification_id UUID,
  notification_type TEXT,
  notification_entity_type TEXT,
  notification_entity_id UUID,
  notification_comment_id UUID,
  notification_actor_id UUID,
  notification_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT o.id
    FROM public.push_outbox o
    WHERE (o.status = 'pending' AND o.send_after <= now())
       OR (o.status = 'processing' AND o.claimed_at < now() - interval '5 minutes')
    ORDER BY o.send_after
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.push_outbox o
    SET status = 'processing',
        claimed_at = now(),
        attempt_count = o.attempt_count + 1
    FROM picked
    WHERE o.id = picked.id
    RETURNING o.*
  )
  SELECT
    c.id,
    c.recipient_id,
    c.category,
    c.collapse_key,
    COALESCE(c.title, n.title),
    COALESCE(c.body, n.body),
    c.data,
    c.attempt_count,
    c.notification_id,
    n.type,
    n.entity_type,
    n.entity_id,
    n.comment_id,
    n.actor_id,
    n.data
  FROM claimed c
  LEFT JOIN public.notifications n ON n.id = c.notification_id;
END;
$$;

COMMENT ON FUNCTION public.claim_push_outbox(INTEGER) IS
  '送る時刻を過ぎた送信待ちを FOR UPDATE SKIP LOCKED で確保し、元の通知の表示文と行き先と一緒に返す。send-push(service role)専用。';

REVOKE ALL ON FUNCTION public.claim_push_outbox(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_outbox(INTEGER) TO service_role;

-- 結果を記録する。p_results は [{"id": "...", "status": "sent|skipped|failed|retry", "error": "..."}]
-- retry は pending に戻し、送る時刻を延ばす(5 回目で failed)。
CREATE OR REPLACE FUNCTION public.finish_push_outbox(p_results JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item JSONB;
  v_status TEXT;
  v_updated INTEGER := 0;
BEGIN
  IF jsonb_typeof(p_results) <> 'array' THEN
    RAISE EXCEPTION 'finish_push_outbox_invalid_results' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_results)
  LOOP
    v_status := v_item ->> 'status';
    IF v_status NOT IN ('sent', 'skipped', 'failed', 'retry') THEN
      CONTINUE;
    END IF;

    UPDATE public.push_outbox o
    SET status = CASE
          WHEN v_status = 'retry' AND o.attempt_count >= 5 THEN 'failed'
          WHEN v_status = 'retry' THEN 'pending'
          ELSE v_status
        END,
        send_after = CASE
          WHEN v_status = 'retry'
            THEN now() + LEAST(interval '30 minutes', interval '30 seconds' * POWER(2, o.attempt_count))
          ELSE o.send_after
        END,
        finished_at = CASE
          WHEN v_status = 'retry' AND o.attempt_count < 5 THEN NULL
          ELSE now()
        END,
        claimed_at = NULL,
        last_error = LEFT(v_item ->> 'error', 1000)
    WHERE o.id = (v_item ->> 'id')::UUID
      AND o.status = 'processing';

    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.finish_push_outbox(JSONB) IS
  'send-push が送った結果を記録する。retry は送る時刻を延ばして pending に戻し、5 回目で failed。send-push(service role)専用。';

REVOKE ALL ON FUNCTION public.finish_push_outbox(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_push_outbox(JSONB) TO service_role;

-- -----------------------------------------------
-- 古い送信済みを消す(7 日)
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_push_outbox()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.push_outbox
  WHERE status IN ('sent', 'skipped', 'failed')
    AND finished_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_push_outbox() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_push_outbox() TO service_role;

-- -----------------------------------------------
-- 実行ログの掃除: 高頻度ジョブに push_outbox_kick を足す
-- -----------------------------------------------
-- 20260809120000 の定義に 'push_outbox_kick' を足しただけ(ほかは同じ)。
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
    'moderation_notification_outbox_dispatch',
    'push_outbox_kick'
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

REVOKE ALL ON FUNCTION public.cleanup_cron_job_run_details() FROM PUBLIC, anon, authenticated;
-- 20260831120000 と同じく service role だけが実行できる
GRANT EXECUTE ON FUNCTION public.cleanup_cron_job_run_details() TO service_role;

-- -----------------------------------------------
-- cron 登録
-- -----------------------------------------------
DO $do$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'push_outbox_kick' LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
  PERFORM cron.schedule(
    'push_outbox_kick',
    '10 seconds',
    'SELECT public.push_outbox_kick();'
  );

  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'push_outbox_cleanup_daily' LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
  -- 毎日 19:10 UTC = JST 4:10(低トラフィック帯)
  PERFORM cron.schedule(
    'push_outbox_cleanup_daily',
    '10 19 * * *',
    'SELECT public.cleanup_push_outbox();'
  );
END;
$do$;

COMMIT;

-- ===============================================
-- DOWN:
-- 送るのを止めるだけなら:
--   SELECT cron.alter_job(
--     job_id := (SELECT jobid FROM cron.job WHERE jobname = 'push_outbox_kick'),
--     active := false
--   );
-- 全部戻すなら:
--   SELECT cron.unschedule('push_outbox_kick');
--   SELECT cron.unschedule('push_outbox_cleanup_daily');
--   DROP TRIGGER IF EXISTS trg_enqueue_push_on_image_job_finished ON public.image_jobs;
--   DROP TRIGGER IF EXISTS trg_enqueue_push_on_notification_renewed ON public.notifications;
--   DROP TRIGGER IF EXISTS trg_enqueue_push_on_notification_insert ON public.notifications;
--   DROP FUNCTION IF EXISTS public.cleanup_push_outbox();
--   DROP FUNCTION IF EXISTS public.finish_push_outbox(JSONB);
--   DROP FUNCTION IF EXISTS public.claim_push_outbox(INTEGER);
--   DROP FUNCTION IF EXISTS public.enqueue_push_for_image_job();
--   DROP FUNCTION IF EXISTS public.push_outbox_kick();
--   DROP FUNCTION IF EXISTS public.enqueue_push_for_notification();
--   DROP FUNCTION IF EXISTS public.push_category_for_notification_type(TEXT);
--   DROP TABLE IF EXISTS public.push_outbox;
--   (cleanup_cron_job_run_details は 20260809120000 の定義に戻す)
-- ===============================================
