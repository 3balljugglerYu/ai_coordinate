-- 誰かの Free プロンプトを使ったら、使った側にもペルコインを付与する（1日1回）。
--
-- 背景: /free のプロンプトを公開する人は増えたが使う人が増えていない
--   （公開46件・うち使われた22件に対し、使った人は7人）。
-- 生成方法別の投稿ボーナス(PR #515・8/14)の前後で free 生成が 6.1→13.8/日、
-- UU が 2.2→6.8/日 になったため、ペルコイン付与は行動を動かすと判断した。
--
-- 既に作者側の還元 prompt_usage_reward(2pc) が動いている。本 migration は
-- **利用者側**の付与を足す。両方が乗るため、自己利用の除外が必須。
--
-- 額は 20pc（admin の percoin_bonus_defaults から変更可）。
-- ⚠️ Low 生成コスト10pc を超えるため、毎日使うだけで net +10pc が積み上がる。
-- 1日1回・自己利用除外で 1アカウント原価 ¥3〜6/日 に収まる前提での運営判断。
-- 詳細は docs/planning/prompt-use-daily-bonus-plan.md

BEGIN;

-- =============================================================================
-- 1. transaction_type を増やす
-- =============================================================================
-- 既存コードには「内訳は metadata で見る(transaction_type を増やすと波及する)」
-- という方針コメントがあるが、ここは新設する。daily_post に相乗りすると
-- **投稿ボーナスの集計に混ざり**、施策ごとの効果が測れなくなる。
-- prompt_usage_reward への相乗りも不可（作者と利用者が混ざる）。

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'purchase'::text,
    'consumption'::text,
    'refund'::text,
    'signup_bonus'::text,
    'daily_post'::text,
    'streak'::text,
    'referral'::text,
    'admin_bonus'::text,
    'forfeiture'::text,
    'tour_bonus'::text,
    'admin_deduction'::text,
    'subscription'::text,
    'collection_completion'::text,
    'prompt_usage_reward'::text,
    'style_usage_reward'::text,
    -- 誰かのプロンプトを使った側への日次ボーナス
    'prompt_use_bonus'::text
  ]));

-- free_percoin_batches.source も同じ列挙で縛られている。
-- ここを忘れると付与の最後で CHECK 違反になり、生成完了ごと巻き戻る。
ALTER TABLE public.free_percoin_batches
  DROP CONSTRAINT IF EXISTS free_percoin_batches_source_check;

ALTER TABLE public.free_percoin_batches
  ADD CONSTRAINT free_percoin_batches_source_check
  CHECK (source = ANY (ARRAY[
    'signup_bonus'::text,
    'tour_bonus'::text,
    'referral'::text,
    'daily_post'::text,
    'streak'::text,
    'admin_bonus'::text,
    'refund'::text,
    'subscription'::text,
    'collection_completion'::text,
    'prompt_usage_reward'::text,
    'style_usage_reward'::text,
    'prompt_use_bonus'::text
  ]));

-- =============================================================================
-- 2. 日次1回の関門
-- =============================================================================
-- 件数を読んで判定すると同時実行で二重付与しうる。UNIQUE への INSERT が
-- 通ったかどうかを唯一の判定にする（daily_post_bonus_grants と同じ作法）。

CREATE TABLE IF NOT EXISTS public.prompt_use_bonus_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jst_date date NOT NULL,
  prompt_usage_event_id uuid REFERENCES public.prompt_usage_events(id) ON DELETE SET NULL,
  credit_transaction_id uuid REFERENCES public.credit_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_use_bonus_grants_user_day_unique UNIQUE (user_id, jst_date)
);

COMMENT ON TABLE public.prompt_use_bonus_grants IS
  '誰かのプロンプトを使ったことによる日次ボーナスの達成記録。UNIQUE(user_id, jst_date) が1日1回の正本。';

CREATE INDEX IF NOT EXISTS idx_prompt_use_bonus_grants_user_created
  ON public.prompt_use_bonus_grants (user_id, created_at DESC);

-- RLS: 本人が自分の達成記録を読めるだけ。書き込みは service_role(SECURITY DEFINER)のみ。
ALTER TABLE public.prompt_use_bonus_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prompt_use_bonus_grants_select_own" ON public.prompt_use_bonus_grants;
CREATE POLICY "prompt_use_bonus_grants_select_own"
  ON public.prompt_use_bonus_grants
  FOR SELECT
  USING (auth.uid() = user_id);

-- =============================================================================
-- 3. 既定額
-- =============================================================================
-- 0 にすれば admin から停止できる（ミッション自体が存在しない扱いになる）。

INSERT INTO public.percoin_bonus_defaults (source, amount)
VALUES ('prompt_use_daily', 20)
ON CONFLICT (source) DO NOTHING;

-- =============================================================================
-- 4. 付与RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.grant_prompt_use_daily_bonus(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.prompt_usage_events%ROWTYPE;
  v_jst_today date;
  v_base_amount integer;
  v_multiplier numeric;
  v_requested integer;
  v_grant_amount integer;
  v_grant_id uuid;
  v_tx_id uuid;
  v_expire_at timestamptz;
BEGIN
  v_jst_today := (current_timestamp AT TIME ZONE 'Asia/Tokyo')::date;

  SELECT * INTO v_event
  FROM public.prompt_usage_events
  WHERE id = p_event_id;

  IF NOT FOUND OR v_event.user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- 自己利用は付与しない。作者還元(2pc)と合わせて二重に取れてしまうため、
  -- ここが最重要のファーミング対策。
  IF v_event.origin_author_id = v_event.user_id THEN
    RETURN 0;
  END IF;

  /*
    原作の公開状態はここで見ない（作者還元とは意図的に違う）。
    派生生成そのものが原作の利用可否を強制しており（非公開・削除済みでは
    生成できない）二重チェックになる。加えて、作者の後の操作で利用者の
    報酬が消えるのは筋が通らない。
  */

  v_base_amount := public.get_percoin_bonus_default('prompt_use_daily');

  IF v_base_amount IS NULL OR v_base_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- 1日1回。ここを通れた者だけが付与に進む
  INSERT INTO public.prompt_use_bonus_grants (user_id, jst_date, prompt_usage_event_id)
  VALUES (v_event.user_id, v_jst_today, p_event_id)
  ON CONFLICT (user_id, jst_date) DO NOTHING
  RETURNING id INTO v_grant_id;

  IF v_grant_id IS NULL THEN
    RETURN 0;
  END IF;

  -- get_grantable_free_percoin_amount は残高を読むだけでロックを取らない。
  -- 同じ受け手に複数の付与が同時に来ると上限を越えて加算されうるため、
  -- 既存の還元RPC・投稿ボーナスと**同じキー・同じ順序**で直列化する。
  PERFORM pg_advisory_xact_lock(hashtextextended(v_event.user_id::text, 0));

  v_multiplier := public.get_subscription_bonus_multiplier(v_event.user_id);
  v_requested := ceil(v_base_amount * v_multiplier)::integer;
  v_grant_amount := public.get_grantable_free_percoin_amount(
    v_event.user_id,
    v_requested
  );

  -- 無料枠の上限に達している場合は0。枠は消費済みとして扱う(投稿ボーナスと同じ)
  IF v_grant_amount <= 0 THEN
    RETURN 0;
  END IF;

  v_expire_at := (
    date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo';

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    metadata
  )
  VALUES (
    v_event.user_id,
    v_grant_amount,
    'prompt_use_bonus',
    jsonb_build_object(
      'source', 'grant_prompt_use_daily_bonus',
      'event_id', p_event_id,
      'origin_post_id', v_event.origin_post_id,
      'origin_author_id', v_event.origin_author_id,
      'image_job_id', v_event.image_job_id,
      'base_bonus_amount', v_base_amount,
      'bonus_multiplier', v_multiplier,
      'requested_bonus_amount', v_requested,
      'granted_bonus_amount', v_grant_amount
    )
  )
  RETURNING id INTO v_tx_id;

  UPDATE public.prompt_use_bonus_grants
  SET credit_transaction_id = v_tx_id
  WHERE id = v_grant_id;

  INSERT INTO public.free_percoin_batches (
    user_id,
    amount,
    remaining_amount,
    granted_at,
    expire_at,
    source,
    credit_transaction_id
  )
  VALUES (
    v_event.user_id,
    v_grant_amount,
    v_grant_amount,
    now(),
    v_expire_at,
    'prompt_use_bonus',
    v_tx_id
  );

  INSERT INTO public.user_credits (user_id, balance, paid_balance)
  VALUES (v_event.user_id, v_grant_amount, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.user_credits.balance + v_grant_amount,
      updated_at = now();

  RETURN v_grant_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_prompt_use_daily_bonus(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_prompt_use_daily_bonus(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.grant_prompt_use_daily_bonus(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_prompt_use_daily_bonus(uuid) TO service_role;

COMMENT ON FUNCTION public.grant_prompt_use_daily_bonus(uuid) IS
  '他人の Free プロンプトを使った利用者へ日次1回のボーナスを付与する。自己利用は除外。額は percoin_bonus_defaults.prompt_use_daily(0で停止)';

-- =============================================================================
-- 5. 記録時に利用者側の付与も試みる
-- =============================================================================
-- 本文は現行定義(20260806150000)のままで、末尾に利用者側の付与を足しただけ。
-- 作者還元とは受け手も条件も違うので、独立した例外ブロックに入れる。
-- この関数は complete_image_job_with_prompt_secrets から呼ばれ、例外を漏らすと
-- 生成全体が失敗扱い＋返金になる。

CREATE OR REPLACE FUNCTION public.record_prompt_usage(p_image_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_job public.image_jobs%ROWTYPE;
  v_origin_author uuid;
  v_event_id uuid;
BEGIN
  SELECT * INTO v_job
  FROM public.image_jobs
  WHERE id = p_image_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'image job not found: %', p_image_job_id;
  END IF;

  -- 派生ジョブでなければ記録しない
  IF v_job.origin_post_id IS NULL THEN
    RETURN;
  END IF;

  IF v_job.status <> 'succeeded' THEN
    RAISE EXCEPTION
      '成功していないジョブの利用イベントは記録しない: %, status=%',
      p_image_job_id, v_job.status;
  END IF;

  -- 原作者は原作行から取る。削除済みでも記録は残す。
  SELECT user_id INTO v_origin_author
  FROM public.generated_images
  WHERE id = v_job.origin_post_id;

  INSERT INTO public.prompt_usage_events (
    image_job_id,
    origin_post_id,
    origin_author_id,
    user_id
  )
  VALUES (
    p_image_job_id,
    v_job.origin_post_id,
    COALESCE(v_origin_author, v_job.user_id),
    v_job.user_id
  )
  ON CONFLICT (image_job_id) DO NOTHING
  RETURNING id INTO v_event_id;

  -- 還元付与(ADR-006)。
  -- この関数にはハンドラが無く、例外は complete_image_job_with_prompt_secrets
  -- 全体を中断させて生成を失敗扱い＋返金にしてしまう。付与だけを内側の
  -- ブロックに閉じ込め、失敗しても pending のまま生成を成功させる。
  IF v_event_id IS NOT NULL THEN
    BEGIN
      PERFORM public.grant_prompt_usage_reward(v_event_id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to grant prompt usage reward (event=%): %', v_event_id, SQLERRM;
    END;

    -- 利用者側の日次ボーナス。作者還元とは別の受け手・別の条件なので独立させる。
    -- ここも例外を漏らすと生成全体が失敗＋返金になるため隔離する。
    BEGIN
      PERFORM public.grant_prompt_use_daily_bonus(v_event_id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to grant prompt use daily bonus (event=%): %', v_event_id, SQLERRM;
    END;
  END IF;
END;
$function$
;

COMMENT ON FUNCTION public.record_prompt_usage(uuid) IS
  '成功済みジョブから origin / 利用者を導出して冪等記録し、原作者への還元と利用者への日次ボーナスを試みる。引数を信用しない';

COMMIT;
