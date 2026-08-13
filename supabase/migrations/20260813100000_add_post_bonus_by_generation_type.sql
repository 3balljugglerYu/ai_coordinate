-- 投稿ボーナスを生成方法ごとにする
-- (計画書: docs/planning/post-bonus-by-generation-type-implementation-plan.md)
--
-- ## 変えること
--
-- これまで「1日1回・生成方法を問わず20」だった投稿ボーナスを、生成方法ごとに
-- 1日1回へ変える(ワンタップ20 / フリー20 / コーデ0)。あわせて
-- **その日に生成した作品のみ**を対象にし、在庫を1枚ずつ出して毎日受け取れる
-- 状態をなくす。
--
-- ## 適用順序
--
-- `grant_daily_post_bonus` の**引数は変えない**ので、migration を先に当てても
-- 既存アプリはそのまま動く(付与の条件が新しくなるだけ)。ただし本 migration で
-- EXECUTE を service_role のみへ絞るため、**デプロイ前に適用すると
-- 付与だけが静かに止まる**(投稿は成功する)。必ず migration → デプロイの順で、
-- かつ間隔を空けずに行うこと。
--
-- 全体を1トランザクションに包む。CHECK の差し替えと RPC の書き換えを跨いで
-- 失敗すると、額を保存できない/付与できない状態が本番に残る。

BEGIN;

-- ============================================================
-- 1) 生成方法ごとの額を持てるようにする
-- ============================================================
--
-- 既存の CHECK は source ごとに範囲を決めており、**どちらの分類にも属さない
-- source は INSERT 自体が通らない**。さらに投稿系は最小1のため 0 停止もできない。
-- 「投稿ボーナス系(0〜1000)」を新設する。0 は「その生成方法には付与しない」。
--
-- inspire(Creator Looks) は本番では機能自体が無効だが、有効化したときに
-- 管理画面から額を入れるだけで動くよう、分類にだけ入れて 0 で置いておく。

ALTER TABLE public.percoin_bonus_defaults
  DROP CONSTRAINT IF EXISTS percoin_bonus_defaults_source_amount_check;

ALTER TABLE public.percoin_bonus_defaults
  ADD CONSTRAINT percoin_bonus_defaults_source_amount_check
  CHECK (
    (
      source = ANY (ARRAY['prompt_usage_reward'::text, 'style_usage_reward'::text])
      AND amount >= 0 AND amount <= 5
    )
    OR (
      source = ANY (ARRAY['signup_bonus'::text, 'tour_bonus'::text, 'referral'::text, 'daily_post'::text])
      AND amount >= 1 AND amount <= 1000
    )
    OR (
      source = ANY (ARRAY[
        'daily_post_one_tap'::text,
        'daily_post_free'::text,
        'daily_post_coordinate'::text,
        'daily_post_inspire'::text
      ])
      AND amount >= 0 AND amount <= 1000
    )
  );

INSERT INTO public.percoin_bonus_defaults (source, amount)
VALUES
  ('daily_post_one_tap', 20),
  ('daily_post_free', 20),
  ('daily_post_coordinate', 0),
  ('daily_post_inspire', 0)
ON CONFLICT (source) DO NOTHING;

-- ============================================================
-- 2) 「生成方法ごとに1日1回」の正本
-- ============================================================
--
-- これまでは profiles.last_daily_post_bonus_at(単一列)で見ていたが、
-- 生成方法ごとにするには表現力が足りない。列を足す方式は生成方法が増えるたびに
-- migration が要るうえ、「読んで判定 → 書く」の間に同時実行が入ると二重付与しうる。
-- UNIQUE にして ON CONFLICT DO NOTHING で原子的に決める。

CREATE TABLE public.daily_post_bonus_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation_type text NOT NULL CHECK (
    generation_type IN ('one_tap_style', 'free', 'coordinate', 'inspire')
  ),
  jst_date date NOT NULL,
  credit_transaction_id uuid REFERENCES public.credit_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_post_bonus_grants_unique UNIQUE (user_id, generation_type, jst_date)
);

-- ミッション画面が「今日この生成方法で受け取ったか」を引く
CREATE INDEX idx_daily_post_bonus_grants_user_date
  ON public.daily_post_bonus_grants (user_id, jst_date DESC);

ALTER TABLE public.daily_post_bonus_grants ENABLE ROW LEVEL SECURITY;

-- 本人の読み取りだけ許す。ミッション画面はブラウザから直接読むため、
-- ポリシーが無いと空になり達成状態を出せない。
CREATE POLICY daily_post_bonus_grants_select_own
  ON public.daily_post_bonus_grants
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 書き込みポリシーは置かない(= SECURITY DEFINER の RPC と service_role のみ)。
-- クライアントから直接 INSERT できると「受け取った記録」を自作できてしまう。

COMMENT ON TABLE public.daily_post_bonus_grants IS
  '投稿ボーナスの受取記録(生成方法×JST日付で1回)。UNIQUE が1日1回の正本。書き込みは service_role/RPC のみ';

-- ============================================================
-- 3) 付与RPCの書き換え(引数は変えない)
-- ============================================================
--
-- 変更点:
-- - 生成方法を**RPC の中で投稿行から引く**(呼び出し側に渡させない = 偽装できない)
-- - is_posted を確認する(投稿せずに直接呼んで受け取る穴を塞ぐ)
-- - その日に生成したものだけ対象にする。完走フィード投稿は生成物ではないので
--   completed_at(完走した日)で見る
-- - 生成方法ごとに1日1回(新テーブルの UNIQUE)
--
-- 倍率・無料枠の上限・有効期限・通知は従来どおり。

CREATE OR REPLACE FUNCTION public.grant_daily_post_bonus(
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
  v_source text;
  v_jst_today date;
  v_made_on date;
  v_base_bonus_amount integer;
  v_bonus_multiplier numeric;
  v_requested_bonus_amount integer;
  v_grant_amount integer;
  v_grant_id uuid;
  v_tx_id uuid;
  v_expire_at timestamptz;
BEGIN
  v_jst_today := (current_timestamp AT TIME ZONE 'Asia/Tokyo')::date;

  SELECT gi.user_id, gi.generation_type, gi.is_posted, gi.completion_id, gi.created_at
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

  -- その日につくったものか。
  -- 完走フィード投稿は生成物ではなく created_at が「投稿化した時刻」なので、
  -- 代わりに完走した日で見る(でないと1ヶ月前の完走でも今日として通ってしまう)
  IF v_post.completion_id IS NOT NULL THEN
    SELECT (cc.completed_at AT TIME ZONE 'Asia/Tokyo')::date
    INTO v_made_on
    FROM public.collection_completions cc
    WHERE cc.id = v_post.completion_id;
  ELSE
    v_made_on := (v_post.created_at AT TIME ZONE 'Asia/Tokyo')::date;
  END IF;

  IF v_made_on IS NULL OR v_made_on <> v_jst_today THEN
    RETURN 0;
  END IF;

  -- 生成方法ごとの額。未対応の生成方法は付与しない
  v_source := CASE v_post.generation_type
    WHEN 'one_tap_style' THEN 'daily_post_one_tap'
    WHEN 'free' THEN 'daily_post_free'
    WHEN 'coordinate' THEN 'daily_post_coordinate'
    WHEN 'inspire' THEN 'daily_post_inspire'
    ELSE NULL
  END;

  IF v_source IS NULL THEN
    RETURN 0;
  END IF;

  v_base_bonus_amount := public.get_percoin_bonus_default(v_source);

  IF v_base_bonus_amount IS NULL OR v_base_bonus_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- 同じ投稿で二重に付与しない
  IF EXISTS (
    SELECT 1
    FROM public.credit_transactions
    WHERE related_generation_id = p_generation_id
      AND transaction_type = 'daily_post'
      AND user_id = p_user_id
  ) THEN
    RETURN 0;
  END IF;

  -- 生成方法ごとに1日1回。ここを通れた者だけが付与に進む
  INSERT INTO public.daily_post_bonus_grants (user_id, generation_type, jst_date)
  VALUES (p_user_id, v_post.generation_type, v_jst_today)
  ON CONFLICT (user_id, generation_type, jst_date) DO NOTHING
  RETURNING id INTO v_grant_id;

  IF v_grant_id IS NULL THEN
    RETURN 0;
  END IF;

  v_bonus_multiplier := public.get_subscription_bonus_multiplier(p_user_id);
  v_requested_bonus_amount := ceil(v_base_bonus_amount * v_bonus_multiplier)::integer;
  v_grant_amount := public.get_grantable_free_percoin_amount(
    p_user_id,
    v_requested_bonus_amount
  );

  -- 後方互換。履歴として残っている参照のために更新は続けるが、
  -- 達成判定の正本は daily_post_bonus_grants
  UPDATE public.profiles
  SET last_daily_post_bonus_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id;

  -- 無料枠の上限に達している場合は0。枠は消費済みとして扱う(従来どおり)
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
    'daily_post',
    p_generation_id,
    jsonb_build_object(
      'posted_at', now(),
      -- 内訳は metadata で見る(transaction_type を増やすと CHECK・admin集計・
      -- 通知マッピング・履歴表示まで波及するため)
      'generation_type', v_post.generation_type,
      'bonus_source', v_source,
      'base_bonus_amount', v_base_bonus_amount,
      'bonus_multiplier', v_bonus_multiplier,
      'requested_bonus_amount', v_requested_bonus_amount,
      'granted_bonus_amount', v_grant_amount
    )
  )
  RETURNING id INTO v_tx_id;

  UPDATE public.daily_post_bonus_grants
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
    p_user_id,
    v_grant_amount,
    v_grant_amount,
    now(),
    v_expire_at,
    'daily_post',
    v_tx_id
  );

  INSERT INTO public.user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, v_grant_amount, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.user_credits.balance + v_grant_amount,
      updated_at = now();

  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    title,
    body,
    data,
    is_read,
    created_at
  )
  VALUES (
    p_user_id,
    p_user_id,
    'bonus',
    'post',
    p_generation_id,
    'デイリー投稿特典獲得！',
    '今日の投稿で' || v_grant_amount || 'ペルコインを獲得しました！',
    jsonb_build_object(
      'bonus_amount', v_grant_amount,
      'bonus_type', 'daily_post',
      'posted_at', now(),
      'generation_type', v_post.generation_type,
      'base_bonus_amount', v_base_bonus_amount,
      'bonus_multiplier', v_bonus_multiplier
    ),
    false,
    now()
  );

  RETURN v_grant_amount;
END;
$$;

-- クライアントから直接呼べないようにする。
-- これまで anon / authenticated にも EXECUTE があり、投稿しなくても呼べば
-- 受け取れる状態だった(is_posted の確認も無かった)。
-- 呼び出しは投稿APIの admin client 経由に変える。
-- create_collection_completion_post からの PERFORM は SECURITY DEFINER 内なので影響しない。
REVOKE ALL ON FUNCTION public.grant_daily_post_bonus(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_daily_post_bonus(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.grant_daily_post_bonus(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_daily_post_bonus(uuid, uuid) TO service_role;

-- ============================================================
-- 4) 移行日の二重取りを塞ぐ
-- ============================================================
--
-- 適用日に既に受け取っている人は、新テーブルが空だともう一度受け取れてしまう。
-- 当日の daily_post を「どの生成方法で受け取ったか」に解決し、**その枠だけ**塞ぐ。
-- 他の生成方法は塞がない(移行日から新仕様で動く、が一番説明しやすいため)。
-- related_generation_id が無い/投稿行が消えている取引は解決できないので飛ばす
-- (塞がない側に倒す)。

INSERT INTO public.daily_post_bonus_grants (
  user_id, generation_type, jst_date, credit_transaction_id
)
SELECT
  ct.user_id,
  gi.generation_type,
  (ct.created_at AT TIME ZONE 'Asia/Tokyo')::date,
  ct.id
FROM public.credit_transactions ct
JOIN public.generated_images gi ON gi.id = ct.related_generation_id
WHERE ct.transaction_type = 'daily_post'
  AND (ct.created_at AT TIME ZONE 'Asia/Tokyo')::date
      = (now() AT TIME ZONE 'Asia/Tokyo')::date
  AND gi.generation_type IN ('one_tap_style', 'free', 'coordinate', 'inspire')
ON CONFLICT (user_id, generation_type, jst_date) DO NOTHING;

COMMIT;
