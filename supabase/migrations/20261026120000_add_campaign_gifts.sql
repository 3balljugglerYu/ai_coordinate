/*
  企画の贈り物(ログインした人へ1人1回、期限つきの無償ペルコインを贈る)

  1. campaign_gifts: 企画ごとの贈り物の設定(額・受け付ける期間・期限・履歴に出す理由)
  2. campaign_gift_claims: 受け取りの記録(企画と人の組で1行だけ=1人1回)
  3. claim_campaign_gift: 受け取る(サーバーだけが呼ぶ。人はサーバーがセッションから決めて渡す)
  4. get_campaign_gift_status: 受け取れるか・受け取ったかを見る
  5. 期限切れを消す処理(expire_free_percoin_batches)を、毎日 0:01 JST にも動かす

  ⭐ 贈った分を必ず最初に使ってもらうため、期限はほかの無償ペルコイン(月末 23:59:59 JST)より早い時刻にする。
     引き落とし(deduct_free_percoins)は「期限の早い順 → もらった日の古い順」に無償の分から引き、
     無償の分がなくなってから有償の分を引く。失敗して返すとき(refund_percoins)も、引いたときの期限のまま戻す。
  ⭐ 取引の種類は増やさない(CHECK・管理画面の集計・通知・履歴の表示まで広がるため)。
     admin_bonus に metadata.reason(履歴にそのまま出る)と bonus_source='campaign_gift'(集計で分ける)を入れる。
     お知らせは入れない(贈り物の画面に、全画面のお知らせが重なるため)。
*/

BEGIN;

-- ===============================================
-- 1. 贈り物の設定
-- ===============================================
CREATE TABLE IF NOT EXISTS public.campaign_gifts (
  campaign_key TEXT PRIMARY KEY CHECK (campaign_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 1000),
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  expire_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT campaign_gifts_period_check CHECK (opens_at < closes_at AND closes_at <= expire_at)
);

COMMENT ON TABLE public.campaign_gifts IS
  '企画の贈り物の設定。ログインした人へ1人1回、expire_at に消える無償ペルコインを amount だけ贈る';

ALTER TABLE public.campaign_gifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campaign_gifts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.campaign_gifts TO service_role;

-- ハロウィン企画: 200ペルコイン。受け付けは 10/27 0:00 JST から(2026-10-26 ユーザー指定)。
-- 受け付けの終わりと期限は 10/31 23:59:00 JST
-- (ほかの無償ペルコインの期限 23:59:59 より早くして、必ず最初に使われるようにする)
INSERT INTO public.campaign_gifts (campaign_key, amount, opens_at, closes_at, expire_at, reason)
VALUES (
  'halloween-best-shot',
  200,
  '2026-10-27 00:00:00+09',
  '2026-10-31 23:59:00+09',
  '2026-10-31 23:59:00+09',
  'ハロウィンの贈り物'
)
ON CONFLICT (campaign_key) DO NOTHING;

-- ===============================================
-- 2. 受け取りの記録
-- ===============================================
CREATE TABLE IF NOT EXISTS public.campaign_gift_claims (
  campaign_key TEXT NOT NULL REFERENCES public.campaign_gifts(campaign_key) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  credit_transaction_id UUID REFERENCES public.credit_transactions(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_key, user_id)
);

COMMENT ON TABLE public.campaign_gift_claims IS
  '企画の贈り物の受け取りの記録。企画と人の組で1行だけ(1人1回)';

ALTER TABLE public.campaign_gift_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campaign_gift_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.campaign_gift_claims TO service_role;

-- ===============================================
-- 3. 受け取る
-- ===============================================
-- 戻り値の status:
--   granted         今回受け取った(amount・expire_at つき)
--   already_claimed もう受け取っている
--   closed          受け付けの期間の外
--   not_found       その企画の贈り物が無い
CREATE OR REPLACE FUNCTION public.claim_campaign_gift(
  p_user_id UUID,
  p_campaign_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_gift public.campaign_gifts%ROWTYPE;
  v_claimed BOOLEAN;
  v_tx_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  SELECT * INTO v_gift
  FROM public.campaign_gifts g
  WHERE g.campaign_key = p_campaign_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF now() < v_gift.opens_at OR now() >= v_gift.closes_at THEN
    RETURN jsonb_build_object('status', 'closed');
  END IF;

  -- 1人1回。ここを通れた者だけが付与に進む
  INSERT INTO public.campaign_gift_claims (campaign_key, user_id, amount)
  VALUES (v_gift.campaign_key, p_user_id, v_gift.amount)
  ON CONFLICT (campaign_key, user_id) DO NOTHING
  RETURNING true INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('status', 'already_claimed');
  END IF;

  -- 同じ人への付与(投稿ボーナス・還元など)と、同じキー・同じ順序で1つずつにする
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    p_user_id,
    v_gift.amount,
    'admin_bonus',
    jsonb_build_object(
      'reason', v_gift.reason,
      'source', 'claim_campaign_gift',
      'bonus_source', 'campaign_gift',
      'campaign_key', v_gift.campaign_key,
      'balance_type', 'period_limited',
      'expire_at', v_gift.expire_at,
      'granted_at', now()
    )
  )
  RETURNING id INTO v_tx_id;

  UPDATE public.campaign_gift_claims
  SET credit_transaction_id = v_tx_id
  WHERE campaign_key = v_gift.campaign_key
    AND user_id = p_user_id;

  INSERT INTO public.free_percoin_batches (
    user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id
  )
  VALUES (
    p_user_id, v_gift.amount, v_gift.amount, now(), v_gift.expire_at, 'admin_bonus', v_tx_id
  );

  INSERT INTO public.user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, v_gift.amount, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.user_credits.balance + v_gift.amount,
      updated_at = now();

  RETURN jsonb_build_object(
    'status', 'granted',
    'amount', v_gift.amount,
    'expire_at', v_gift.expire_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_campaign_gift(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_campaign_gift(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_campaign_gift(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_gift(UUID, TEXT) TO service_role;

-- ===============================================
-- 4. 受け取れるか・受け取ったか
-- ===============================================
-- p_user_id が NULL(ログインしていない人)のときは、claimed は false
CREATE OR REPLACE FUNCTION public.get_campaign_gift_status(
  p_user_id UUID,
  p_campaign_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_gift public.campaign_gifts%ROWTYPE;
  v_claimed BOOLEAN := false;
BEGIN
  SELECT * INTO v_gift
  FROM public.campaign_gifts g
  WHERE g.campaign_key = p_campaign_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('open', false, 'claimed', false);
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.campaign_gift_claims c
      WHERE c.campaign_key = v_gift.campaign_key
        AND c.user_id = p_user_id
    ) INTO v_claimed;
  END IF;

  RETURN jsonb_build_object(
    'open', now() >= v_gift.opens_at AND now() < v_gift.closes_at,
    'claimed', v_claimed,
    'amount', v_gift.amount,
    'expire_at', v_gift.expire_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_campaign_gift_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campaign_gift_status(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_campaign_gift_status(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_gift_status(UUID, TEXT) TO service_role;

-- ===============================================
-- 5. 期限切れを消す処理を、毎日 0:01 JST(15:01 UTC)にも動かす
-- ===============================================
-- 月に1回(毎月1日 09:05 JST)だけだと、期限が来てから消えるまでの間、
-- 使えない分が残高の数に残る。期限の過ぎたまとまりだけを消す処理なので、毎日動かしても二重には引かない。
-- 同じ名前で登録し直すと上書きになる(pg_cron 1.6)。
SELECT cron.schedule(
  'expire_free_percoin_daily',
  '1 15 * * *',
  'SELECT public.expire_free_percoin_batches();'
);

COMMIT;

-- ===============================================
-- DOWN:
-- SELECT cron.unschedule('expire_free_percoin_daily');
-- DROP FUNCTION IF EXISTS public.get_campaign_gift_status(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.claim_campaign_gift(UUID, TEXT);
-- DROP TABLE IF EXISTS public.campaign_gift_claims;
-- DROP TABLE IF EXISTS public.campaign_gifts;
-- (受け取った人のペルコインは、取引と期限つきのまとまりとして残る。期限に消える)
-- ===============================================
