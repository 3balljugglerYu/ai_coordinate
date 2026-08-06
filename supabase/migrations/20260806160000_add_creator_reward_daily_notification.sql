-- クリエイター還元の通知（今日ぶん1件・更新方式）
-- (docs/planning/creator-reward-daily-notification-implementation-plan.md)
--
-- 還元(#483 / 20260806150000)でペルコインが付与されたことを本人が気づけるようにする。
-- 現状は残高が黙って増えるだけで、ユーザー向けのペルコイン履歴 UI も無い。
--
-- 方式: 受け手ごと・JST の日付ごとに通知を1件だけ持ち、付与のたびに内容を更新する。
--   - 「今日、あなたの作品が◯回利用され◯ペルコイン獲得！」と累計が育つ
--   - 更新のたびに未読へ戻し、created_at も進めて一覧の先頭へ浮上させる
--   - 通知欄に増える行は1日1件なので、いいね・コメント・フォローを押し流さない
--
-- 主要な設計判断(計画書の ADR に対応):
--   ADR-001 (recipient, JST日付) で1行に集約し UPSERT で更新する
--   ADR-002 累計は data.usage_count / data.total_amount に加算で持つ。
--           実際に付与された額を積むので、企画で単価が変わってもずれない
--   ADR-003 通知の失敗は付与を巻き込まない(内側の BEGIN...EXCEPTION で隔離)。
--           #483 ADR-006 と同じ規律
--   ADR-004 更新時に created_at も進める。一覧の並びはサーバー・クライアントとも
--           created_at DESC, id DESC で統一されており、ページングも
--           created_at|id のキーセットカーソルのため、行が上へ移動しても
--           重複・取りこぼしが起きない
--
-- 適用順序: 新規 RPC 追加のみでシグネチャ変更なし。通常順で可。

BEGIN;

-- =============================================================================
-- 1. 通知タイプの追加
-- =============================================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (
    type = ANY (
      ARRAY[
        'like'::text, 'comment'::text, 'follow'::text, 'bonus'::text,
        'style_template_approved'::text, 'style_template_rejected'::text,
        'style_template_unpublished'::text,
        'catalog_entry_approved'::text, 'catalog_entry_rejected'::text,
        'catalog_entry_unpublished'::text,
        'creator_looks_submission_received'::text,
        'creator_looks_submission_acknowledged'::text,
        'creator_looks_moderation_result'::text,
        'creator_looks_post_published'::text,
        'post_moderation_removed'::text,
        'post_moderation_appeal_result'::text,
        'derived_post_published'::text,
        'derived_usage_milestone'::text,
        'style_preset_post_published'::text,
        'style_preset_usage_milestone'::text,
        'usage_reward_earned'::text
      ]
    )
  );

-- 受け手 × JST日付 で1行に集約するための部分ユニークインデックス(ADR-001)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_usage_reward_daily_idx
  ON public.notifications (recipient_id, (data->>'reward_date'))
  WHERE type = 'usage_reward_earned';

COMMENT ON INDEX public.notifications_unique_usage_reward_daily_idx IS
  'クリエイター還元通知は受け手ごと・JST日付ごとに1行。付与のたびに UPSERT で累計を加算する';

-- =============================================================================
-- 2. 通知の UPSERT
-- =============================================================================
--
-- 匿名通知(actor_id = recipient)。誰が利用したかは含めない。
-- create_notification は自己宛をスキップするため使わず、直接 INSERT する
-- (notify_on_prompt_usage_milestone と同じ先例)。
CREATE OR REPLACE FUNCTION public.upsert_usage_reward_notification(
  p_recipient uuid,
  p_amount integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date text;
  v_notified_at timestamptz;
BEGIN
  IF p_recipient IS NULL OR COALESCE(p_amount, 0) <= 0 THEN
    RETURN;
  END IF;

  -- 集約キーの日付と created_at は必ず同じ時刻から導く。
  -- now() はトランザクション開始時刻なので、再処理バッチが JST 23:59:59 に
  -- 始まって付与が 00:00 以降に走ると「日付は前日・created_at は当日」になり、
  -- 実時刻ベースでは同じ日に2行並んでしまう。
  v_notified_at := clock_timestamp();
  v_date := to_char(v_notified_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD');

  INSERT INTO public.notifications (
    recipient_id, actor_id, type, entity_type, entity_id,
    title, body, data, is_read, created_at
  )
  VALUES (
    p_recipient, p_recipient, 'usage_reward_earned', 'user', p_recipient,
    '', '',
    jsonb_build_object(
      'reward_date', v_date,
      'usage_count', 1,
      'total_amount', p_amount
    ),
    false, v_notified_at
  )
  ON CONFLICT (recipient_id, (data->>'reward_date'))
  WHERE type = 'usage_reward_earned'
  DO UPDATE SET
    data = jsonb_set(
      jsonb_set(
        public.notifications.data,
        '{usage_count}',
        to_jsonb(COALESCE((public.notifications.data->>'usage_count')::integer, 0) + 1)
      ),
      '{total_amount}',
      to_jsonb(COALESCE((public.notifications.data->>'total_amount')::integer, 0) + p_amount)
    ),
    -- 未読へ戻してバッジを点け、created_at も進めて一覧の先頭へ浮上させる(ADR-004)
    is_read = false,
    created_at = v_notified_at;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_usage_reward_notification(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_usage_reward_notification(uuid, integer) TO service_role;

COMMENT ON FUNCTION public.upsert_usage_reward_notification(uuid, integer) IS
  'クリエイター還元の通知を受け手×JST日付で1行に集約して更新する(service_role専用)。更新時は未読へ戻し created_at も進めて先頭へ浮上させる';

-- =============================================================================
-- 3. 付与RPCから呼び出す(ADR-003: 内側の例外ブロックで隔離)
-- =============================================================================
--
-- 本文は 20260806150000 と同一で、付与成立後に通知の呼び出しだけを足している。
-- 通知が失敗しても付与・利用イベント・生成完了は確定させる。

CREATE OR REPLACE FUNCTION public.grant_prompt_usage_reward(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.prompt_usage_events%ROWTYPE;
  v_recipient uuid;
  v_origin_ok boolean;
  v_amount integer;
BEGIN
  -- 受け手を先に読む(ロックを他のどのロックよりも先に取るため。ADR-008)
  SELECT e.origin_author_id INTO v_recipient
  FROM public.prompt_usage_events e
  WHERE e.id = p_event_id AND e.reward_status = 'pending';

  IF v_recipient IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_recipient::text, 0));

  UPDATE public.prompt_usage_events e
  SET reward_status = 'granted'
  WHERE e.id = p_event_id
    AND e.reward_status = 'pending'
  RETURNING e.* INTO v_event;

  IF v_event.id IS NULL THEN
    RETURN;
  END IF;

  -- 自己利用は付与しない(REQ-03)
  IF v_event.origin_author_id = v_event.user_id THEN
    UPDATE public.prompt_usage_events
    SET reward_status = 'skipped', reward_processed_at = now()
    WHERE id = p_event_id;
    RETURN;
  END IF;

  -- 原作が公開中であること(REQ-06)
  SELECT (gi.is_posted = true AND gi.moderation_status = 'visible')
  INTO v_origin_ok
  FROM public.generated_images gi
  WHERE gi.id = v_event.origin_post_id;

  IF v_origin_ok IS DISTINCT FROM true THEN
    UPDATE public.prompt_usage_events
    SET reward_status = 'skipped', reward_processed_at = now()
    WHERE id = p_event_id;
    RETURN;
  END IF;

  v_amount := public.apply_usage_reward_grant(
    v_event.origin_author_id,
    'prompt_usage_reward',
    jsonb_build_object(
      'source', 'grant_prompt_usage_reward',
      'event_id', p_event_id,
      'origin_post_id', v_event.origin_post_id,
      'image_job_id', v_event.image_job_id
    )
  );

  IF v_amount <= 0 THEN
    UPDATE public.prompt_usage_events
    SET reward_status = 'skipped', reward_processed_at = now()
    WHERE id = p_event_id;
    RETURN;
  END IF;

  UPDATE public.prompt_usage_events
  SET reward_granted_at = now(), reward_processed_at = now()
  WHERE id = p_event_id;

  -- 通知(ADR-003)。失敗しても付与は巻き戻さない。
  BEGIN
    PERFORM public.upsert_usage_reward_notification(v_event.origin_author_id, v_amount);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to upsert usage reward notification (recipient=%): %',
        v_event.origin_author_id, SQLERRM;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_style_preset_usage_reward(p_generated_image_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.style_preset_usage_events%ROWTYPE;
  v_provider uuid;
  v_amount integer;
BEGIN
  -- 受け手(provider)を先に解決する。provider_user_id は profiles.id への FK
  -- なので profiles.user_id を明示的に引く(ADR-005)。
  SELECT COALESCE(preset_provider.user_id, category_provider.user_id)
  INTO v_provider
  FROM public.style_preset_usage_events e
  JOIN public.style_presets sp ON sp.id = e.preset_id
  LEFT JOIN public.preset_categories pc ON pc.id = sp.category_id
  LEFT JOIN public.profiles preset_provider ON preset_provider.id = sp.provider_user_id
  LEFT JOIN public.profiles category_provider ON category_provider.id = pc.provider_user_id
  WHERE e.generated_image_id = p_generated_image_id AND e.reward_status = 'pending';

  IF v_provider IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_provider::text, 0));
  END IF;

  UPDATE public.style_preset_usage_events e
  SET reward_status = 'granted'
  WHERE e.generated_image_id = p_generated_image_id
    AND e.reward_status = 'pending'
  RETURNING e.* INTO v_event;

  IF v_event.generated_image_id IS NULL THEN
    RETURN;
  END IF;

  -- クリエイター未設定 → 誰にも付与しない(REQ-05) / 自己利用も付与しない(REQ-03)
  IF v_provider IS NULL OR v_provider = v_event.user_id THEN
    UPDATE public.style_preset_usage_events
    SET reward_status = 'skipped', reward_processed_at = now()
    WHERE generated_image_id = p_generated_image_id;
    RETURN;
  END IF;

  v_amount := public.apply_usage_reward_grant(
    v_provider,
    'style_usage_reward',
    jsonb_build_object(
      'source', 'grant_style_preset_usage_reward',
      'event_id', p_generated_image_id,
      'preset_id', v_event.preset_id,
      'generated_image_id', v_event.generated_image_id
    )
  );

  IF v_amount <= 0 THEN
    UPDATE public.style_preset_usage_events
    SET reward_status = 'skipped', reward_processed_at = now()
    WHERE generated_image_id = p_generated_image_id;
    RETURN;
  END IF;

  UPDATE public.style_preset_usage_events
  SET reward_granted_at = now(), reward_processed_at = now()
  WHERE generated_image_id = p_generated_image_id;

  -- 通知(ADR-003)。失敗しても付与は巻き戻さない。
  BEGIN
    PERFORM public.upsert_usage_reward_notification(v_provider, v_amount);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to upsert usage reward notification (recipient=%): %',
        v_provider, SQLERRM;
  END;
END;
$$;

-- =============================================================================
-- 4. カタログ検証
-- =============================================================================

DO $$
DECLARE
  v_idx integer;
  v_fn integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_type_check'
      AND pg_get_constraintdef(oid) LIKE '%usage_reward_earned%'
  ) THEN
    RAISE EXCEPTION 'notifications_type_check に usage_reward_earned が入っていない';
  END IF;

  SELECT count(*) INTO v_idx
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'notifications_unique_usage_reward_daily_idx';
  IF v_idx <> 1 THEN
    RAISE EXCEPTION '日次集約の一意インデックスが無い';
  END IF;

  SELECT count(*) INTO v_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'upsert_usage_reward_notification';
  IF v_fn <> 1 THEN
    RAISE EXCEPTION '通知 UPSERT 関数が無い';
  END IF;

  IF has_function_privilege('authenticated',
    'public.upsert_usage_reward_notification(uuid, integer)', 'EXECUTE')
  THEN
    RAISE EXCEPTION '通知 UPSERT 関数が authenticated から実行可能になっている';
  END IF;

  -- 付与RPCが通知を呼んでいること(隔離込み)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('grant_prompt_usage_reward', 'grant_style_preset_usage_reward')
      AND p.prosrc LIKE '%upsert_usage_reward_notification%'
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION '付与RPCから通知が呼ばれていない';
  END IF;

  RAISE NOTICE 'カタログ検証 OK(type追加・一意idx・UPSERT関数・権限・付与RPCからの呼び出し)';
END;
$$;

-- =============================================================================
-- 5. 実データ dry-run(必ずロールバックする)
-- =============================================================================

DO $$
DECLARE
  v_user uuid;
  v_count integer;
  v_amount integer;
  v_created_1 timestamptz;
  v_created_2 timestamptz;
  v_is_read boolean;
  v_rows integer;
  v_free_event uuid;
  v_free_recipient uuid;
  v_status text;
  v_balance integer;
BEGIN
  SELECT user_id INTO v_user FROM public.profiles WHERE user_id IS NOT NULL LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE '実データが無いため dry-run をスキップした(プレビュー環境等)';
    RETURN;
  END IF;

  BEGIN
    -- (a) 1回目は新規作成される
    PERFORM public.upsert_usage_reward_notification(v_user, 2);

    SELECT (data->>'usage_count')::integer, (data->>'total_amount')::integer, created_at
    INTO v_count, v_amount, v_created_1
    FROM public.notifications
    WHERE recipient_id = v_user AND type = 'usage_reward_earned';

    IF v_count <> 1 OR v_amount <> 2 THEN
      RAISE EXCEPTION '1回目の集計が違う(count=%, amount=%)', v_count, v_amount;
    END IF;

    -- (b) 既読にしてから2回目。行は増えず、累計が加算され、未読へ戻り、created_at が進む
    UPDATE public.notifications
    SET is_read = true
    WHERE recipient_id = v_user AND type = 'usage_reward_earned';

    PERFORM pg_sleep(0.01);
    PERFORM public.upsert_usage_reward_notification(v_user, 5);

    SELECT count(*) INTO v_rows
    FROM public.notifications
    WHERE recipient_id = v_user AND type = 'usage_reward_earned';

    SELECT (data->>'usage_count')::integer, (data->>'total_amount')::integer, created_at, is_read
    INTO v_count, v_amount, v_created_2, v_is_read
    FROM public.notifications
    WHERE recipient_id = v_user AND type = 'usage_reward_earned';

    IF v_rows <> 1 THEN
      RAISE EXCEPTION '2回目で行が増えた(rows=%)', v_rows;
    END IF;
    IF v_count <> 2 OR v_amount <> 7 THEN
      RAISE EXCEPTION '2回目の集計が違う(count=%, amount=%。単価が変わっても実額を足すこと)', v_count, v_amount;
    END IF;
    IF v_is_read IS DISTINCT FROM false THEN
      RAISE EXCEPTION '2回目で未読へ戻っていない';
    END IF;
    IF v_created_2 <= v_created_1 THEN
      RAISE EXCEPTION 'created_at が進んでいない(先頭へ浮上しない)';
    END IF;

    -- (c) 付与額0では作成も更新もしない
    PERFORM public.upsert_usage_reward_notification(v_user, 0);
    SELECT (data->>'usage_count')::integer INTO v_count
    FROM public.notifications
    WHERE recipient_id = v_user AND type = 'usage_reward_earned';
    IF v_count <> 2 THEN
      RAISE EXCEPTION '額0で更新されてしまった(count=%)', v_count;
    END IF;

    -- (d) 通知が失敗しても付与は残る(ADR-003 の本丸)。
    --     一時的な NOT VALID CHECK で還元通知の書き込みだけを失敗させ、
    --     付与RPC を通した上で reward_status / 取引 / 残高が確定していることを見る。
    --     この検証を入れないと、将来 upsert の呼び出しが内側の例外ブロックから
    --     外れても、カタログ検証(関数名の grep)はすり抜けてしまう。
    SELECT e.id, e.origin_author_id INTO v_free_event, v_free_recipient
    FROM public.prompt_usage_events e
    JOIN public.image_jobs j ON j.id = e.image_job_id
    JOIN public.generated_images gi ON gi.id = e.origin_post_id
    WHERE j.status = 'succeeded'
      AND e.user_id <> e.origin_author_id
      AND gi.is_posted = true
      AND gi.moderation_status = 'visible'
    LIMIT 1;

    IF v_free_event IS NULL THEN
      RAISE NOTICE '通知失敗ケースの検証は対象イベントが無いためスキップした';
    ELSE
      -- 還元を有効化し、対象イベントを未処理へ戻す
      UPDATE public.percoin_bonus_defaults SET amount = 2 WHERE source = 'prompt_usage_reward';
      UPDATE public.prompt_usage_events
      SET reward_status = 'pending', reward_granted_at = NULL, reward_processed_at = NULL
      WHERE id = v_free_event;

      -- 受け手のキャップ枠を空けておく(上限到達だと skipped になり検証にならない)
      INSERT INTO public.user_credits (user_id, balance, paid_balance)
      VALUES (v_free_recipient, 0, 0)
      ON CONFLICT (user_id) DO UPDATE SET balance = 0, paid_balance = 0;

      ALTER TABLE public.notifications
        ADD CONSTRAINT dry_run_reject_usage_reward_notification
        CHECK (type <> 'usage_reward_earned') NOT VALID;

      PERFORM public.grant_prompt_usage_reward(v_free_event);

      ALTER TABLE public.notifications
        DROP CONSTRAINT dry_run_reject_usage_reward_notification;

      SELECT reward_status INTO v_status
      FROM public.prompt_usage_events WHERE id = v_free_event;
      SELECT COALESCE(balance, 0) INTO v_balance
      FROM public.user_credits WHERE user_id = v_free_recipient;

      IF v_status <> 'granted' THEN
        RAISE EXCEPTION '通知失敗で付与まで巻き戻った(status=%)', v_status;
      END IF;
      IF v_balance <> 2 THEN
        RAISE EXCEPTION '通知失敗で残高が入っていない(balance=%)', v_balance;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.credit_transactions
        WHERE metadata->>'event_id' = v_free_event::text
          AND transaction_type = 'prompt_usage_reward'
      ) THEN
        RAISE EXCEPTION '通知失敗で取引が残っていない';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.notifications
        WHERE recipient_id = v_free_recipient AND type = 'usage_reward_earned'
      ) THEN
        RAISE EXCEPTION '失敗させたはずの通知が作られている';
      END IF;
    END IF;

    RAISE NOTICE '実データ dry-run OK(新規作成・2回目で行が増えず累計加算・未読へ復帰・created_atが進む・額0は無反応・通知失敗でも付与RPCの結果は残る)';

    RAISE EXCEPTION 'PT999' USING ERRCODE = 'PT999';
  EXCEPTION
    WHEN SQLSTATE 'PT999' THEN
      RAISE NOTICE 'dry-run の変更はすべてロールバックした';
  END;
END;
$$;

-- PostgREST のスキーマキャッシュへ新関数を反映する
NOTIFY pgrst, 'reload schema';

COMMIT;
