-- 付与額の「予約」。指定した日時になったら自動で新しい額に切り替わる。
--
-- 背景: 額の変更は「10月1日から」のように告知して行うが、現状は深夜0時に
-- 手で書き換えるしかない。押し忘れれば告知と実態がズレ、押し間違えれば
-- 意図しない額で配ってしまう。日時を先に入れておけるようにする。
--
-- ⚠️ **cron で書き換える方式にはしない。** 定期実行が動かなかった日に静かに
-- 切り替わらない事故が起きる（cron の succeeded は当てにならない、という
-- 実績がある）。**読み取りの瞬間に判定する**ので、切替漏れが構造的に起きない。

BEGIN;

SET LOCAL lock_timeout = '3s';

-- =============================================================================
-- 1. 予約列
-- =============================================================================
-- 予約は 1 行につき 1 件。複数の将来変更を積む運用は想像できないため、
-- 必要になってから足す（テーブルを分けるより、この形の方が画面も単純になる）。

ALTER TABLE public.percoin_bonus_defaults
  ADD COLUMN IF NOT EXISTS scheduled_amount integer NULL,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz NULL;

ALTER TABLE public.percoin_streak_defaults
  ADD COLUMN IF NOT EXISTS scheduled_amount integer NULL,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz NULL;

-- 片方だけ入っている状態は「いつ切り替わるか分からない予約」または
-- 「額の無い予約」になる。どちらも意味を持たないので両方揃うことを強制する。
ALTER TABLE public.percoin_bonus_defaults
  DROP CONSTRAINT IF EXISTS percoin_bonus_defaults_schedule_pair_check;
ALTER TABLE public.percoin_bonus_defaults
  ADD CONSTRAINT percoin_bonus_defaults_schedule_pair_check
  CHECK ((scheduled_amount IS NULL) = (scheduled_at IS NULL));

ALTER TABLE public.percoin_streak_defaults
  DROP CONSTRAINT IF EXISTS percoin_streak_defaults_schedule_pair_check;
ALTER TABLE public.percoin_streak_defaults
  ADD CONSTRAINT percoin_streak_defaults_schedule_pair_check
  CHECK ((scheduled_amount IS NULL) = (scheduled_at IS NULL));

-- 予約額にも現在額と同じ範囲を課す。ここを緩めると、切り替わった瞬間に
-- 許容外の額で配り始める（例: 還元が上限5のところ100になる）。
ALTER TABLE public.percoin_bonus_defaults
  DROP CONSTRAINT IF EXISTS percoin_bonus_defaults_scheduled_amount_check;
ALTER TABLE public.percoin_bonus_defaults
  ADD CONSTRAINT percoin_bonus_defaults_scheduled_amount_check
  CHECK (
    scheduled_amount IS NULL
    OR (
      (source = ANY (ARRAY['prompt_usage_reward'::text, 'style_usage_reward'::text])
        AND scheduled_amount >= 0 AND scheduled_amount <= 5)
      OR (source = ANY (ARRAY['signup_bonus'::text, 'tour_bonus'::text, 'referral'::text, 'daily_post'::text])
        AND scheduled_amount >= 1 AND scheduled_amount <= 1000)
      OR (source = ANY (ARRAY['daily_post_one_tap'::text, 'daily_post_free'::text, 'daily_post_coordinate'::text, 'daily_post_inspire'::text])
        AND scheduled_amount >= 0 AND scheduled_amount <= 1000)
      OR (source = 'prompt_use_daily'::text
        AND scheduled_amount >= 0 AND scheduled_amount <= 1000)
    )
  );

ALTER TABLE public.percoin_streak_defaults
  DROP CONSTRAINT IF EXISTS percoin_streak_defaults_scheduled_amount_check;
ALTER TABLE public.percoin_streak_defaults
  ADD CONSTRAINT percoin_streak_defaults_scheduled_amount_check
  CHECK (
    scheduled_amount IS NULL
    OR (scheduled_amount >= 1 AND scheduled_amount <= 1000)
  );

COMMENT ON COLUMN public.percoin_bonus_defaults.scheduled_amount IS
  '予約額。scheduled_at を過ぎたらこの額が使われる（amount は書き換えない）。';
COMMENT ON COLUMN public.percoin_bonus_defaults.scheduled_at IS
  '切替日時。この時刻以降 scheduled_amount が有効になる。読み取り時に判定するため cron に依存しない。';
COMMENT ON COLUMN public.percoin_streak_defaults.scheduled_amount IS
  '予約額。scheduled_at を過ぎたらこの額が使われる。';
COMMENT ON COLUMN public.percoin_streak_defaults.scheduled_at IS
  '切替日時。この時刻以降 scheduled_amount が有効になる。';

-- =============================================================================
-- 2. 読み取り時に切替を判定する
-- =============================================================================
-- 本体は現行定義のまま。行を読んだあとに「予約が来ていれば予約額」を返す
-- 1 段を足しただけ。フォールバック値も現行のまま残す。
--
-- CREATE OR REPLACE（引数は不変）なので EXECUTE 権限は維持される。

CREATE OR REPLACE FUNCTION public.get_percoin_bonus_default(p_source text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_amount INTEGER;
BEGIN
  SELECT amount, scheduled_amount, scheduled_at
  INTO v_row
  FROM percoin_bonus_defaults
  WHERE source = p_source;

  IF NOT FOUND THEN
    -- フォールバック（現行値）
    RETURN CASE p_source
      WHEN 'signup_bonus' THEN 50
      WHEN 'tour_bonus' THEN 20
      WHEN 'referral' THEN 100
      WHEN 'daily_post' THEN 30
      ELSE 0
    END;
  END IF;

  -- 予約の時刻を過ぎていれば予約額。過ぎていなければ現在額
  IF v_row.scheduled_at IS NOT NULL
     AND v_row.scheduled_amount IS NOT NULL
     AND now() >= v_row.scheduled_at THEN
    v_amount := v_row.scheduled_amount;
  ELSE
    v_amount := v_row.amount;
  END IF;

  RETURN coalesce(v_amount, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_percoin_streak_amount(p_streak_day integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_amount INTEGER;
BEGIN
  SELECT amount, scheduled_amount, scheduled_at
  INTO v_row
  FROM percoin_streak_defaults
  WHERE streak_day = p_streak_day;

  IF NOT FOUND THEN
    -- フォールバック（現行値）
    RETURN CASE p_streak_day
      WHEN 1 THEN 10 WHEN 2 THEN 10 WHEN 3 THEN 20 WHEN 4 THEN 10 WHEN 5 THEN 10
      WHEN 6 THEN 10 WHEN 7 THEN 50 WHEN 8 THEN 10 WHEN 9 THEN 10 WHEN 10 THEN 10
      WHEN 11 THEN 10 WHEN 12 THEN 10 WHEN 13 THEN 10 WHEN 14 THEN 100
      ELSE 0
    END;
  END IF;

  IF v_row.scheduled_at IS NOT NULL
     AND v_row.scheduled_amount IS NOT NULL
     AND now() >= v_row.scheduled_at THEN
    v_amount := v_row.scheduled_amount;
  ELSE
    v_amount := v_row.amount;
  END IF;

  RETURN coalesce(v_amount, 0);
END;
$function$;


-- =============================================================================
-- 3. 額を直接読んでいた関数を、解決関数経由へ寄せる
-- =============================================================================
-- ⚠️ ここを直さないと**画面と実際の付与がズレる**。切替後、付与は新しい額に
-- なるのに、ミッション一覧やガイドは `amount` を直読みして旧額を出し続ける。
-- 「20と書いてあるのに10しか入らない」が一番たちの悪い壊れ方なので、
-- 判定は get_percoin_bonus_default / get_percoin_streak_amount の 1 か所に集める。
--
-- どれも本体は現行のまま、額の取り方だけを差し替えている。
-- 引数が変わらないので CREATE OR REPLACE で EXECUTE 権限は維持される。

-- クリエイター還元の付与額。
-- ⚠️ 本体は**本番の現行定義そのまま**（pg_get_functiondef で取得したもの）で、
-- 額の取り方だけを差し替えている。書き写すと引数や本体を取り違える。
CREATE OR REPLACE FUNCTION public.apply_usage_reward_grant(p_recipient_id uuid, p_source text, p_metadata jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_configured integer;
  v_amount integer;
  v_tx_id uuid;
  v_expire_at timestamptz;
  v_rows_updated integer;
BEGIN
  -- 予約の切替を含めた「いま有効な額」を使う（判定は解決関数に集約）
  v_configured := public.get_percoin_bonus_default(p_source);

  -- 未設定 = 付与しない(既定0で出荷するため、admin が額を入れるまでここで抜ける)
  IF COALESCE(v_configured, 0) <= 0 THEN
    RETURN 0;
  END IF;

  -- 5万無料残高キャップ。受け手単位の直列化は呼び出し元の付与RPCが冒頭で
  -- 取る advisory lock で担保する(ADR-008。共有関数側には入れない)
  v_amount := public.get_grantable_free_percoin_amount(p_recipient_id, v_configured);

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.credit_transactions (
    user_id, amount, transaction_type, related_generation_id, metadata
  ) VALUES (
    p_recipient_id, v_amount, p_source, NULL, p_metadata
  )
  RETURNING id INTO v_tx_id;

  v_expire_at := (
    date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo';

  INSERT INTO public.free_percoin_batches (
    user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id
  )
  VALUES (p_recipient_id, v_amount, v_amount, now(), v_expire_at, p_source, v_tx_id);

  UPDATE public.user_credits
  SET balance = balance + v_amount, updated_at = now()
  WHERE user_id = p_recipient_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    INSERT INTO public.user_credits (user_id, balance, paid_balance)
    VALUES (p_recipient_id, v_amount, 0)
    ON CONFLICT (user_id) DO UPDATE SET
      balance = user_credits.balance + v_amount,
      updated_at = now();
  END IF;

  RETURN v_amount;
END;
$function$;

-- 生成方法ごとの投稿ボーナス額(ミッション一覧の表示に使う)
CREATE OR REPLACE FUNCTION public.get_post_bonus_amounts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    jsonb_object_agg(
      t.key,
      public.get_percoin_bonus_default(t.source)
    ),
    '{}'::jsonb
  )
  FROM (
    VALUES
      ('one_tap_style', 'daily_post_one_tap'),
      ('free', 'daily_post_free'),
      ('coordinate', 'daily_post_coordinate'),
      ('inspire', 'daily_post_inspire')
  ) AS t(key, source)
  WHERE EXISTS (
    SELECT 1 FROM public.percoin_bonus_defaults d WHERE d.source = t.source
  );
$function$;

-- プロンプト利用ミッションの額(ミッション一覧の表示に使う)
CREATE OR REPLACE FUNCTION public.get_prompt_use_bonus_amount()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.get_percoin_bonus_default('prompt_use_daily');
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
