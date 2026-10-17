-- ===============================================
-- アプリのプッシュ通知: 運営お知らせ・全体配信 (admin_push_broadcasts)
-- ===============================================
-- 計画書: docs/planning/push-notifications-implementation-plan.md
--         Phase 5 / REQ-013 / ADR-002, ADR-003
--
-- 【流れ】
--   admin が「運営お知らせ（プッシュ通知も送る）」を公開する、または
--   /admin/push-broadcasts で配信を作る → admin_push_broadcasts に 1 行(scheduled)
--   pg_cron(10 秒ごと) → push_outbox_kick():
--     send_at を過ぎた配信がある時だけ fan_out_push_broadcasts() を呼び、
--     宛先のある人へ push_outbox を一定数ずつ積む(続きは次の 10 秒で)
--     → 積んだ行の send_after は配信の send_at(もう過ぎている)なので、
--       同じ呼び出しの中で send-push を起こす
--   send-push が push_allowed_now で設定(種類・一時停止・止める時間帯)を見て送る
--
-- 【誰に積むか】
-- 宛先(push_device_tokens)があり、かつ「運営からのお知らせ」(announcements)が
-- オンの人だけ。announcements は既定オフ(push_category_default)なので、
-- 行の無い人・明示的にオンにしていない人は積まない。
-- 退会・停止中(profiles.deactivated_at)の人も積まない。退会は削除まで 30 日
-- auth.users が残るので、宛先の ON DELETE CASCADE では消えない
-- (宛先そのものも 20261014120100 で消す。ここは念のための二重の守り)。
-- 一時停止と止める時間帯はここでは見ない(時刻で変わるので送る時に send-push が
-- 判定して skipped にする)。push_allowed_now を 1 人ずつ呼ばず、表の結合だけで
-- 絞るので軽い。
--
-- 【古くなった配信は送らない】
-- send_at から 1 時間たっても展開できなかった配信(cron や DB が長く止まっていた)は
-- 積まずに expired で閉じる。展開の途中で止まった配信も、残りは積まない。
-- 積む行の send_after は配信の send_at にするので、積んだあとも claim_push_outbox の
-- 期限(1 時間)が予定の時刻から数えて効く(送信関数が止まっていても、復旧後に
-- 古い告知をまとめて送らない)。
--
-- 【生成完了を先に送る】
-- claim_push_outbox は配信の行を後回しにして取り出す(20261013120100 の定義の
-- ORDER BY だけを変更)。数千人への配信を送っているあいだも、生成完了(15 分で
-- 期限切れ)やいいねなどの通知を待たせない。
--
-- 【お知らせを消したら送らない】
-- announcement_id は ON DELETE CASCADE。お知らせを削除すると配信も、
-- まだ送っていない push_outbox の行も(broadcast_id の CASCADE で)消える。
-- 通知の取り消しを行の削除で表す ADR-002 と同じ考え方。消えたお知らせへの
-- プッシュ(押しても開けない)を構造的に起こさない。履歴は admin_audit_log に残る。
--
-- 【取り消し】
-- 予約中(scheduled)の間だけ canceled にできる。展開中(sending)の行は
-- fan_out_push_broadcasts が FOR UPDATE で握るので、同時に取り消そうとしても
-- 「scheduled のときだけ」の UPDATE が 0 行で終わる(API は 409 を返す)。
--
-- 【負荷(ADR-003)】
-- push_outbox_kick に足すのは「送る時刻を過ぎた予約があるか」の部分索引の
-- 参照だけ。配信が無い時の 10 秒ごとの処理は増えない。

BEGIN;

-- -----------------------------------------------
-- admin_push_broadcasts
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_push_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- プッシュの表示文
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 300),
  -- 押したときの行き先(アプリ内のパス、または https の URL)。
  -- お知らせに紐づく配信はアプリが announcement_id で詳細を開く
  url TEXT CHECK (
    url IS NULL
    OR (
      char_length(url) <= 500
      AND (url ~ '^/[^/]' OR url = '/' OR url ~ '^https://')
    )
  ),
  -- 運営お知らせに紐づく配信。お知らせを消したら配信も消す(送らない)
  announcement_id UUID REFERENCES public.admin_announcements(id) ON DELETE CASCADE,
  send_at TIMESTAMPTZ NOT NULL,
  -- sent は「宛先ごとの送信待ちを積み終えた」(送れた数は push_outbox で数える)。
  -- expired は send_at から 1 時間たっても展開できず、(残りを)送らなかった
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'sending', 'sent', 'canceled', 'expired')
  ),
  -- 積んだ宛先の数(送れた数は push_outbox の status で数える)
  enqueued_count INTEGER NOT NULL DEFAULT 0,
  -- 展開の続き(ここより大きい user_id から積む)
  last_recipient_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ
);

-- 1 つのお知らせにつき配信は 1 つ(編集のたびに増やさない)
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_push_broadcasts_announcement
  ON public.admin_push_broadcasts (announcement_id)
  WHERE announcement_id IS NOT NULL;

-- push_outbox_kick が 10 秒ごとに見る(送る時刻を過ぎた予約・展開中)
CREATE INDEX IF NOT EXISTS idx_admin_push_broadcasts_due
  ON public.admin_push_broadcasts (send_at)
  WHERE status IN ('scheduled', 'sending');

-- 履歴の一覧
CREATE INDEX IF NOT EXISTS idx_admin_push_broadcasts_created_at
  ON public.admin_push_broadcasts (created_at DESC);

COMMENT ON TABLE public.admin_push_broadcasts IS
  '運営お知らせ・全体配信のプッシュ通知。send_at を過ぎると push_outbox_kick が宛先ごとに push_outbox へ展開する。service role だけが扱う (Phase 5)。';

ALTER TABLE public.admin_push_broadcasts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_push_broadcasts FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_admin_push_broadcasts_updated_at ON public.admin_push_broadcasts;
CREATE TRIGGER trg_admin_push_broadcasts_updated_at
  BEFORE UPDATE ON public.admin_push_broadcasts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------
-- push_outbox に配信の元を足す
-- -----------------------------------------------
ALTER TABLE public.push_outbox
  ADD COLUMN IF NOT EXISTS broadcast_id UUID
    REFERENCES public.admin_push_broadcasts(id) ON DELETE CASCADE;

ALTER TABLE public.push_outbox
  DROP CONSTRAINT IF EXISTS push_outbox_single_source_check;
ALTER TABLE public.push_outbox
  ADD CONSTRAINT push_outbox_single_source_check CHECK (
    num_nonnulls(notification_id, image_job_id, broadcast_id) <= 1
  );

-- 同じ配信を同じ人に 2 度積まない(展開のやり直しでも重ならない)
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_outbox_broadcast_recipient
  ON public.push_outbox (broadcast_id, recipient_id)
  WHERE broadcast_id IS NOT NULL;

-- -----------------------------------------------
-- 配信を宛先ごとに展開する
-- -----------------------------------------------
-- send_at を過ぎた配信を、1 回につき p_batch_size 人ずつ push_outbox へ積む。
-- 続きは last_recipient_id から(10 秒後の次の呼び出しで)。最後まで積んだら sent。
-- send_at から 1 時間たっても積み終えていない配信は、(残りを)積まずに expired。
-- 戻り値は今回積んだ行数。
CREATE OR REPLACE FUNCTION public.fan_out_push_broadcasts(p_batch_size INTEGER DEFAULT 2000)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch INTEGER := LEAST(GREATEST(COALESCE(p_batch_size, 2000), 1), 10000);
  -- send_at がこれより前なら送らない(claim_push_outbox の期限と同じ 1 時間)
  v_expire_before TIMESTAMPTZ := now() - interval '1 hour';
  v_broadcast public.admin_push_broadcasts%ROWTYPE;
  v_announcement_status TEXT;
  v_announcement_publish_at TIMESTAMPTZ;
  v_recipient_ids UUID[];
  v_picked INTEGER;
  v_inserted INTEGER;
  v_total INTEGER := 0;
  v_data JSONB;
BEGIN
  FOR v_broadcast IN
    SELECT *
    FROM public.admin_push_broadcasts
    WHERE status IN ('scheduled', 'sending')
      AND send_at <= now()
    ORDER BY send_at
    LIMIT 5
    FOR UPDATE SKIP LOCKED
  LOOP
    -- お知らせに紐づく配信は、お知らせが今も公開されているかを確かめる
    -- (API でも合わせているが、直接の書き換えで食い違っても誤送信しない)
    IF v_broadcast.announcement_id IS NOT NULL AND v_broadcast.status = 'scheduled' THEN
      SELECT a.status, a.publish_at
      INTO v_announcement_status, v_announcement_publish_at
      FROM public.admin_announcements a
      WHERE a.id = v_broadcast.announcement_id;

      IF v_announcement_status IS DISTINCT FROM 'published' THEN
        UPDATE public.admin_push_broadcasts
        SET status = 'canceled', canceled_at = now()
        WHERE id = v_broadcast.id;
        CONTINUE;
      END IF;

      IF v_announcement_publish_at IS NOT NULL AND v_announcement_publish_at > now() THEN
        -- 公開が先に延びた。公開時刻に合わせて待つ
        UPDATE public.admin_push_broadcasts
        SET send_at = v_announcement_publish_at
        WHERE id = v_broadcast.id;
        CONTINUE;
      END IF;
    END IF;

    -- 送る時刻から 1 時間たっても積み終えていない(cron や DB が長く止まっていた)。
    -- 古い告知をまとめて送らないよう、(残りを)積まずに閉じる。
    -- 積んだ分は claim_push_outbox が同じ期限で閉じる(send_after = send_at のため)
    IF v_broadcast.send_at < v_expire_before THEN
      UPDATE public.admin_push_broadcasts
      SET status = 'expired', finished_at = now()
      WHERE id = v_broadcast.id;
      CONTINUE;
    END IF;

    -- 「運営からのお知らせ」がオンで宛先のある人(user_id の順に続きから)。
    -- 退会・停止中の人は除く
    SELECT array_agg(c.user_id ORDER BY c.user_id)
    INTO v_recipient_ids
    FROM (
      SELECT DISTINCT t.user_id
      FROM public.push_device_tokens t
      LEFT JOIN public.push_preferences p ON p.user_id = t.user_id
      WHERE (v_broadcast.last_recipient_id IS NULL OR t.user_id > v_broadcast.last_recipient_id)
        AND COALESCE(p.enabled, true)
        AND COALESCE(
          (p.categories ->> 'announcements')::BOOLEAN,
          public.push_category_default('announcements'),
          false
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.profiles pr
          WHERE pr.user_id = t.user_id
            AND pr.deactivated_at IS NOT NULL
        )
      ORDER BY t.user_id
      LIMIT v_batch
    ) c;

    v_picked := COALESCE(array_length(v_recipient_ids, 1), 0);
    v_inserted := 0;

    IF v_picked > 0 THEN
      v_data := jsonb_strip_nulls(jsonb_build_object(
        'kind', 'announcement',
        'broadcast_id', v_broadcast.id,
        'announcement_id', v_broadcast.announcement_id,
        'url', v_broadcast.url
      ));

      INSERT INTO public.push_outbox (
        recipient_id, category, broadcast_id, collapse_key, title, body, data, send_after
      )
      SELECT
        r.user_id,
        'announcements',
        v_broadcast.id,
        'broadcast:' || v_broadcast.id::TEXT,
        v_broadcast.title,
        v_broadcast.body,
        v_data,
        -- 予定の時刻。claim_push_outbox の期限(1 時間)を、積んだ時刻ではなく
        -- 予定の時刻から数える
        v_broadcast.send_at
      FROM unnest(v_recipient_ids) AS r(user_id)
      ON CONFLICT (broadcast_id, recipient_id) WHERE broadcast_id IS NOT NULL
        DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
    END IF;

    v_total := v_total + v_inserted;

    UPDATE public.admin_push_broadcasts
    SET status = CASE WHEN v_picked < v_batch THEN 'sent' ELSE 'sending' END,
        enqueued_count = enqueued_count + v_inserted,
        last_recipient_id = CASE
          WHEN v_picked > 0 THEN v_recipient_ids[v_picked]
          ELSE last_recipient_id
        END,
        started_at = COALESCE(started_at, now()),
        finished_at = CASE WHEN v_picked < v_batch THEN now() ELSE NULL END
    WHERE id = v_broadcast.id;
  END LOOP;

  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.fan_out_push_broadcasts(INTEGER) IS
  'send_at を過ぎた運営配信を、宛先があり「運営からのお知らせ」がオンで退会・停止中でない人へ push_outbox として積む(1 回 p_batch_size 人ずつ、続きは次の呼び出し。行の send_after は send_at)。send_at から 1 時間たっても積み終えていない配信は expired にして残りを積まない。push_outbox_kick から呼ばれる。';

REVOKE ALL ON FUNCTION public.fan_out_push_broadcasts(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fan_out_push_broadcasts(INTEGER) TO service_role;

-- -----------------------------------------------
-- 送信関数を起こす(配信の展開を足す)
-- -----------------------------------------------
-- 20261013120100 の定義の先頭に「送る時刻を過ぎた配信があれば展開する」を
-- 足しただけ(ほかは同じ)。展開は cron から呼ばれた時だけ。
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
  -- 運営配信: 送る時刻を過ぎたものがある時だけ展開する(部分索引だけを見る)。
  -- 生成完了のトリガー(enqueue_push_for_image_job)から呼ばれた時は展開しない
  -- (生成結果を書くトランザクションに数千行の INSERT を混ぜない。cron に任せる)。
  IF pg_trigger_depth() = 0 AND EXISTS (
    SELECT 1
    FROM public.admin_push_broadcasts
    WHERE status IN ('scheduled', 'sending')
      AND send_at <= now()
  ) THEN
    BEGIN
      PERFORM public.fan_out_push_broadcasts();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'push_outbox_kick: fan_out_push_broadcasts failed: %', SQLERRM;
    END;
  END IF;

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
  '送る時刻を過ぎた運営配信があれば push_outbox へ展開し、送る時刻を過ぎた送信待ちがある時だけ Edge Function send-push を起こす (ADR-003)。pg_cron(10 秒ごと)と生成完了のトリガーから呼ばれる。';

REVOKE ALL ON FUNCTION public.push_outbox_kick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_outbox_kick() TO service_role;

-- -----------------------------------------------
-- 送信待ちの取り出し(配信の行を後回しにする)
-- -----------------------------------------------
-- 20261013120100 の定義の ORDER BY に「配信の行(broadcast_id あり)は後」を
-- 足しただけ(ほかは同じ)。配信は数千行を一度に積むので、送る時刻の順だけで
-- 取り出すと、そのあいだの生成完了(15 分で期限切れ)やいいねなどの通知が
-- 配信を送り終えるまで待たされる。
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
DECLARE
  v_now TIMESTAMPTZ := now();
  -- これより前に確保したままの行は、送信関数が落ちたとみなす
  v_stale_before TIMESTAMPTZ := now() - interval '5 minutes';
  -- 送る時刻がこれより前なら期限切れ(生成完了は短く)
  v_expire_before TIMESTAMPTZ := now() - interval '1 hour';
  v_expire_generation_before TIMESTAMPTZ := now() - interval '15 minutes';
BEGIN
  -- もう送らない行を閉じる。ほかの呼び出しが確保中の行は飛ばす(SKIP LOCKED)
  WITH closing AS (
    SELECT
      o.id,
      (
        o.send_after < v_expire_before
        OR (o.category = 'generation' AND o.send_after < v_expire_generation_before)
      ) AS is_expired
    FROM public.push_outbox o
    WHERE (
        o.status = 'pending'
        OR (o.status = 'processing' AND o.claimed_at < v_stale_before)
      )
      AND (
        o.send_after < v_expire_before
        OR (o.category = 'generation' AND o.send_after < v_expire_generation_before)
        OR (o.status = 'processing' AND o.attempt_count >= 5)
      )
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.push_outbox o
  SET status = CASE WHEN c.is_expired THEN 'skipped' ELSE 'failed' END,
      last_error = CASE WHEN c.is_expired THEN 'expired' ELSE 'stale_claim' END,
      claimed_at = NULL,
      finished_at = v_now
  FROM closing c
  WHERE o.id = c.id;

  RETURN QUERY
  WITH picked AS (
    SELECT o.id
    FROM public.push_outbox o
    WHERE (
        (o.status = 'pending' AND o.send_after <= v_now)
        OR (
          o.status = 'processing'
          AND o.claimed_at < v_stale_before
          AND o.attempt_count < 5
        )
      )
      -- 上で閉じられなかった(ほかの呼び出しが確保中だった)期限切れも送らない
      AND o.send_after >= v_expire_before
      AND NOT (o.category = 'generation' AND o.send_after < v_expire_generation_before)
    -- 配信の行は後回し(false が先)。同じ側の中は送る時刻の順
    ORDER BY (o.broadcast_id IS NOT NULL), o.send_after
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
  '送る時刻を過ぎた送信待ちを FOR UPDATE SKIP LOCKED で確保し、元の通知の表示文と行き先と一緒に返す。運営配信の行は後回しにする。確保の前に、送る時刻を 1 時間(生成完了は 15 分)過ぎた行を skipped(expired)、確保したまま止まって確保 5 回目の行を failed(stale_claim)にする。send-push(service role)専用。';

REVOKE ALL ON FUNCTION public.claim_push_outbox(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_outbox(INTEGER) TO service_role;

-- -----------------------------------------------
-- 管理画面用: 配信ごとの送信結果の数
-- -----------------------------------------------
-- PostgREST の 1000 行上限で数え漏れないよう、集計は DB で行う。
-- push_outbox は 7 日で掃除されるので、それより古い配信は enqueued_count だけが残る。
CREATE OR REPLACE FUNCTION public.admin_push_broadcast_stats(p_broadcast_ids UUID[])
RETURNS TABLE (
  broadcast_id UUID,
  status TEXT,
  row_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.broadcast_id, o.status, count(*)::BIGINT
  FROM public.push_outbox o
  WHERE o.broadcast_id = ANY(p_broadcast_ids)
  GROUP BY o.broadcast_id, o.status;
$$;

COMMENT ON FUNCTION public.admin_push_broadcast_stats(UUID[]) IS
  '運営配信ごとの push_outbox の状態別件数。admin API(service role)専用。';

REVOKE ALL ON FUNCTION public.admin_push_broadcast_stats(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_push_broadcast_stats(UUID[]) TO service_role;

COMMIT;

-- ===============================================
-- DOWN:
-- 配信だけを止めるなら(予約をすべて取り消す):
--   UPDATE public.admin_push_broadcasts
--   SET status = 'canceled', canceled_at = now()
--   WHERE status IN ('scheduled', 'sending');
-- 全部戻すなら:
--   push_outbox_kick と claim_push_outbox を 20261013120100 の定義に戻す
--   DROP FUNCTION IF EXISTS public.admin_push_broadcast_stats(UUID[]);
--   DROP FUNCTION IF EXISTS public.fan_out_push_broadcasts(INTEGER);
--   DROP INDEX IF EXISTS public.uq_push_outbox_broadcast_recipient;
--   DELETE FROM public.push_outbox WHERE broadcast_id IS NOT NULL;
--   ALTER TABLE public.push_outbox DROP CONSTRAINT IF EXISTS push_outbox_single_source_check;
--   ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_single_source_check
--     CHECK (num_nonnulls(notification_id, image_job_id) <= 1);
--   ALTER TABLE public.push_outbox DROP COLUMN IF EXISTS broadcast_id;
--   DROP TABLE IF EXISTS public.admin_push_broadcasts;
-- ===============================================
