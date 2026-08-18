-- 他の人の Free プロンプトで作った作品を**投稿したら**、使った側にもペルコインを
-- 付与する（1日1回）。
--
-- 背景: /free のプロンプトを公開する人は増えたが使う人が増えていない
--   （公開46件・うち使われた22件に対し、使った人は7人）。
-- 生成方法別の投稿ボーナス(PR #515・8/14)の前後で free 生成が 6.1→13.8/日、
-- UU が 2.2→6.8/日 になったため、ペルコイン付与は行動を動かすと判断した。
--
-- 既に作者側の還元 prompt_usage_reward(2pc) が動いている。本 migration は
-- **利用者側**の付与を足す。両方が乗るため、自己利用の除外が必須。
--
-- **投稿を条件にする理由**: 生成で終わるとその人の中で完結してしまう。
-- 投稿されて初めてフィードで次の人の目に触れ、原作者にもクレジット経由で
-- 露出が回り「自分も使ってみよう」が連鎖する。使う人を増やすのが目的なので、
-- 増やす装置がある投稿の側に報酬を置く。
-- 既存の投稿ボーナス2種とも規則が揃い（その日つくったものを投稿したら20）、
-- ミッションの説明が一行で済むという利点もある。
-- 実データでは派生生成36件のうち投稿は17件(47%)で、残りを投稿へ押し出す力も働く。
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
  generation_id uuid REFERENCES public.generated_images(id) ON DELETE SET NULL,
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

CREATE OR REPLACE FUNCTION public.grant_prompt_use_daily_bonus(
  p_user_id uuid,
  p_generation_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post record;
  v_origin_author uuid;
  v_jst_today date;
  v_made_on date;
  v_base_amount integer;
  v_multiplier numeric;
  v_requested integer;
  v_grant_amount integer;
  v_grant_id uuid;
  v_tx_id uuid;
  v_expire_at timestamptz;
BEGIN
  v_jst_today := (current_timestamp AT TIME ZONE 'Asia/Tokyo')::date;

  SELECT gi.user_id, gi.is_posted, gi.created_at, gi.image_job_id
  INTO v_post
  FROM public.generated_images gi
  WHERE gi.id = p_generation_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- 本人の投稿であること。呼び出し側が別人の ID を渡しても通さない
  IF v_post.user_id IS NULL OR v_post.user_id <> p_user_id THEN
    RETURN 0;
  END IF;

  -- 投稿されていること(RPC を直接呼んでも、投稿していなければ受け取れない)
  IF v_post.is_posted IS NOT TRUE THEN
    RETURN 0;
  END IF;

  -- その日つくったものか(投稿ボーナスと同じ規則)
  v_made_on := (v_post.created_at AT TIME ZONE 'Asia/Tokyo')::date;
  IF v_made_on IS NULL OR v_made_on <> v_jst_today THEN
    RETURN 0;
  END IF;

  -- 他の人のプロンプトから作った作品であること。
  -- 派生かどうかは image_jobs.origin_post_id が正本(引数を信用しない)。
  SELECT e.origin_author_id INTO v_origin_author
  FROM public.prompt_usage_events e
  WHERE e.image_job_id = v_post.image_job_id;

  IF v_origin_author IS NULL THEN
    RETURN 0;
  END IF;

  -- 自己利用は付与しない。作者還元(2pc)と合わせて二重に取れてしまうため、
  -- ここが最重要のファーミング対策。
  IF v_origin_author = p_user_id THEN
    RETURN 0;
  END IF;

  v_base_amount := public.get_percoin_bonus_default('prompt_use_daily');

  IF v_base_amount IS NULL OR v_base_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- 1日1回。ここを通れた者だけが付与に進む
  INSERT INTO public.prompt_use_bonus_grants (user_id, jst_date, generation_id)
  VALUES (p_user_id, v_jst_today, p_generation_id)
  ON CONFLICT (user_id, jst_date) DO NOTHING
  RETURNING id INTO v_grant_id;

  IF v_grant_id IS NULL THEN
    RETURN 0;
  END IF;

  -- get_grantable_free_percoin_amount は残高を読むだけでロックを取らない。
  -- 同じ受け手に複数の付与が同時に来ると上限を越えて加算されうるため、
  -- 既存の還元RPC・投稿ボーナスと**同じキー・同じ順序**で直列化する。
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  v_multiplier := public.get_subscription_bonus_multiplier(p_user_id);
  v_requested := ceil(v_base_amount * v_multiplier)::integer;
  v_grant_amount := public.get_grantable_free_percoin_amount(p_user_id, v_requested);

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
    related_generation_id,
    metadata
  )
  VALUES (
    p_user_id,
    v_grant_amount,
    'prompt_use_bonus',
    p_generation_id,
    jsonb_build_object(
      'source', 'grant_prompt_use_daily_bonus',
      'origin_author_id', v_origin_author,
      'image_job_id', v_post.image_job_id,
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
    user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id
  )
  VALUES (
    p_user_id, v_grant_amount, v_grant_amount, now(), v_expire_at, 'prompt_use_bonus', v_tx_id
  );

  INSERT INTO public.user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, v_grant_amount, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.user_credits.balance + v_grant_amount,
      updated_at = now();

  RETURN v_grant_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_prompt_use_daily_bonus(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_prompt_use_daily_bonus(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.grant_prompt_use_daily_bonus(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_prompt_use_daily_bonus(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.grant_prompt_use_daily_bonus(uuid, uuid) IS
  '他の人の Free プロンプトで作った作品を投稿したときの日次ボーナス。自己利用は除外。額は percoin_bonus_defaults.prompt_use_daily(0で停止)';

-- =============================================================================
-- 5. ミッション一覧に出すための読み取り
-- =============================================================================
-- percoin_bonus_defaults は RLS で直接読めないため、投稿ボーナスと同じく
-- RPC 経由で額を渡す。**一覧に出ないとミッションとして機能しない**
-- (ペルコインは支払いではなく標識として効いている、というのが本施策の前提)。

CREATE OR REPLACE FUNCTION public.get_prompt_use_bonus_amount()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT amount FROM public.percoin_bonus_defaults WHERE source = 'prompt_use_daily'),
    0
  );
$$;

REVOKE ALL ON FUNCTION public.get_prompt_use_bonus_amount() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_prompt_use_bonus_amount() TO anon;
GRANT EXECUTE ON FUNCTION public.get_prompt_use_bonus_amount() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_prompt_use_bonus_amount() TO service_role;

COMMENT ON FUNCTION public.get_prompt_use_bonus_amount() IS
  'プロンプト利用ミッションの付与額。0 のときはミッション自体を出さない';

COMMIT;
