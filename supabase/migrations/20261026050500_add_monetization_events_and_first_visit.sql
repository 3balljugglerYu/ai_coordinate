BEGIN;

/*
  管理ダッシュボード P3(記録を取り始める)の DB。
  計画: docs/planning/admin-growth-p3-instrumentation-plan.md(4章・5章・7章)

  1. monetization_events: 課金の手前の出来事
     (足りなくなった・購入画面を見た・支払いを始めた・期限切れ)
  2. record_monetization_event: 書き込みの入口(回数の上限・重複の防止つき)
  3. profiles.first_visit_channel / first_landing_path: どの画面から来ても残す流入元
  4. handle_new_user: メールでの登録でも、上の2つを user_metadata から写す
     (20260817100000 の定義から、この2つを写す部分だけを足した。ほかは変えていない)

  権限: 表と関数は PUBLIC / anon / authenticated から外し、service_role にだけ渡す
  (20260831110000 の前例。FROM PUBLIC だけでは anon から呼べる)。
*/

-- ===============================================
-- 1. 課金の手前の出来事
-- ===============================================
CREATE TABLE IF NOT EXISTS public.monetization_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CONSTRAINT monetization_events_event_type_check
    CHECK (event_type IN ('percoin_shortage', 'purchase_view', 'checkout_start', 'checkout_expired')),
  -- 足りなくなった場所
  feature text
    CONSTRAINT monetization_events_feature_check
    CHECK (feature IS NULL OR feature IN ('generate', 'style_generate', 'gacha_split', 'name_input')),
  -- client = 画面で止めた / server = API が返した
  where_detected text
    CONSTRAINT monetization_events_where_check
    CHECK (where_detected IS NULL OR where_detected IN ('client', 'server')),
  -- 買いに来た場所(購入の origin と同じ値)・買おうとしたもの
  origin text
    CONSTRAINT monetization_events_origin_length CHECK (origin IS NULL OR char_length(origin) <= 64),
  product text
    CONSTRAINT monetization_events_product_length CHECK (product IS NULL OR char_length(product) <= 64),
  required integer
    CONSTRAINT monetization_events_required_check CHECK (required IS NULL OR required >= 0),
  balance integer
    CONSTRAINT monetization_events_balance_check CHECK (balance IS NULL OR balance >= 0),
  stripe_session_id text
    CONSTRAINT monetization_events_session_length
    CHECK (stripe_session_id IS NULL OR char_length(stripe_session_id) <= 255),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monetization_events_type_created_idx
  ON public.monetization_events (event_type, created_at);
CREATE INDEX IF NOT EXISTS monetization_events_user_created_idx
  ON public.monetization_events (user_id, created_at);
-- 支払い画面ごとに「開始」「期限切れ」は1行だけ(webhook の送り直しでも増やさない)
CREATE UNIQUE INDEX IF NOT EXISTS monetization_events_session_once_idx
  ON public.monetization_events (stripe_session_id, event_type)
  WHERE stripe_session_id IS NOT NULL;

COMMENT ON TABLE public.monetization_events IS
  '課金の手前の出来事(足りなくなった・購入画面を見た・支払いを始めた・期限切れ)。service_role だけが読み書きする。';

ALTER TABLE public.monetization_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.monetization_events FROM PUBLIC;
REVOKE ALL ON TABLE public.monetization_events FROM anon;
REVOKE ALL ON TABLE public.monetization_events FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.monetization_events TO service_role;

-- ===============================================
-- 2. 書き込みの入口
-- ===============================================
-- 戻り値: 書いたら true、書かなかったら false(回数の上限・同じ支払い画面の2回目)。
-- 回数の上限は DB で数える(サーバーレスでは、プロセスの中の数え方だとインスタンスごとにばらばらになる)。
-- 同じ人の数え方と書き込みを、人ごとの advisory lock で1つずつにする。
CREATE OR REPLACE FUNCTION public.record_monetization_event(
  p_user_id uuid,
  p_event_type text,
  p_feature text DEFAULT NULL,
  p_where_detected text DEFAULT NULL,
  p_origin text DEFAULT NULL,
  p_product text DEFAULT NULL,
  p_required integer DEFAULT NULL,
  p_balance integer DEFAULT NULL,
  p_stripe_session_id text DEFAULT NULL,
  p_max_per_minute integer DEFAULT 10
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_recent integer;
  v_inserted integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('monetization_event:' || p_user_id::text));

  SELECT count(*) INTO v_recent
  FROM public.monetization_events e
  WHERE e.user_id = p_user_id
    AND e.created_at > now() - interval '1 minute';

  IF v_recent >= greatest(coalesce(p_max_per_minute, 10), 0) THEN
    RETURN false;
  END IF;

  INSERT INTO public.monetization_events (
    user_id, event_type, feature, where_detected, origin, product,
    required, balance, stripe_session_id
  )
  VALUES (
    p_user_id, p_event_type, p_feature, p_where_detected,
    left(p_origin, 64), left(p_product, 64),
    p_required, greatest(p_balance, 0), p_stripe_session_id
  )
  ON CONFLICT (stripe_session_id, event_type) WHERE stripe_session_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_monetization_event(uuid, text, text, text, text, text, integer, integer, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_monetization_event(uuid, text, text, text, text, text, integer, integer, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.record_monetization_event(uuid, text, text, text, text, text, integer, integer, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_monetization_event(uuid, text, text, text, text, text, integer, integer, text, integer) TO service_role;

-- ===============================================
-- 3. どの画面から来ても残す流入元
-- ===============================================
-- signup_source(目印・企画の既定値)とは別に持つ。目印の無い訪問は、来た場所と最初の画面だけを残す。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_visit_channel text
    CONSTRAINT profiles_first_visit_channel_check
    CHECK (first_visit_channel IS NULL OR first_visit_channel IN ('x_ad', 'x', 'meta', 'search', 'other', 'direct')),
  ADD COLUMN IF NOT EXISTS first_landing_path text
    CONSTRAINT profiles_first_landing_path_check
    CHECK (first_landing_path IS NULL OR (first_landing_path ~ '^/' AND char_length(first_landing_path) <= 200));

COMMENT ON COLUMN public.profiles.first_visit_channel IS
  '最初に来た場所(x_ad / x / meta / search / other / direct)。登録の時に cookie persta_first_visit から入れる。';
COMMENT ON COLUMN public.profiles.first_landing_path IS
  '最初に開いた画面のパス(クエリなし・200文字まで)。登録の時に cookie persta_first_visit から入れる。';

-- ===============================================
-- 4. 登録の時のトリガー
-- ===============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_default_nickname text;
  v_signup_bonus integer;
  v_tx_id uuid;
  v_expire_at timestamptz;
  v_signup_source text;
  v_first_visit_channel text;
  v_first_landing_path text;
BEGIN
  v_signup_bonus := get_percoin_bonus_default('signup_bonus');

  IF NEW.email IS NOT NULL THEN
    v_default_nickname := split_part(NEW.email, '@', 1);
    IF length(v_default_nickname) > 20 THEN
      v_default_nickname := left(v_default_nickname, 20);
    END IF;
  END IF;

  -- 書式は profiles_signup_source_check と一致させること。
  -- 値の許可リストは持たない(企画キー等の任意タグを受け入れるため)。
  v_signup_source := NULLIF(NEW.raw_user_meta_data->>'signup_source', '');
  IF v_signup_source IS NOT NULL
     AND v_signup_source !~ '^[a-z0-9_-]{1,40}$' THEN
    v_signup_source := NULL;
  END IF;

  -- 最初に来た場所と、最初に開いた画面(20261026050500)。
  -- 書式は profiles の CHECK と一致させ、合わない値は NULL に落とす
  -- (CHECK 違反で INSERT が落ちると、末尾の EXCEPTION がプロフィールを作らないまま握りつぶすため)。
  v_first_visit_channel := NULLIF(NEW.raw_user_meta_data->>'first_visit_channel', '');
  IF v_first_visit_channel IS NOT NULL
     AND v_first_visit_channel NOT IN ('x_ad', 'x', 'meta', 'search', 'other', 'direct') THEN
    v_first_visit_channel := NULL;
  END IF;

  v_first_landing_path := NULLIF(NEW.raw_user_meta_data->>'first_landing_path', '');
  IF v_first_landing_path IS NOT NULL
     AND (v_first_landing_path !~ '^/' OR char_length(v_first_landing_path) > 200) THEN
    v_first_landing_path := NULL;
  END IF;

  INSERT INTO public.profiles (
    id, user_id, nickname, signup_source, first_visit_channel, first_landing_path
  )
  VALUES (
    NEW.id, NEW.id, v_default_nickname, v_signup_source,
    v_first_visit_channel, v_first_landing_path
  )
  ON CONFLICT (user_id) DO NOTHING;

  v_expire_at := (
    date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo';

  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    NEW.id,
    v_signup_bonus,
    'signup_bonus',
    jsonb_build_object('bucket', 'promo')
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
  VALUES (NEW.id, v_signup_bonus, v_signup_bonus, now(), v_expire_at, 'signup_bonus', v_tx_id);

  INSERT INTO public.user_credits (user_id, balance, paid_balance)
  VALUES (NEW.id, v_signup_bonus, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + v_signup_bonus, updated_at = NOW();

  BEGIN
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
    ) VALUES (
      NEW.id,
      NEW.id,
      'bonus',
      'user',
      NEW.id,
      '新規登録ボーナス獲得！',
      '新規登録特典として' || v_signup_bonus || 'ペルコインを獲得しました！',
      jsonb_build_object(
        'bonus_amount', v_signup_bonus,
        'bonus_type', 'signup_bonus',
        'granted_at', NOW()
      ),
      false,
      NOW()
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Error creating signup bonus notification: %', SQLERRM;
  END;

  BEGIN
    PERFORM generate_referral_code(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Error generating referral code: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
  RETURN NEW;
END;
$function$;

COMMIT;

-- ===============================================
-- DOWN:
-- handle_new_user は 20260817100000 の CREATE OR REPLACE FUNCTION 文を流し直す(先に戻すこと)。
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS first_landing_path;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS first_visit_channel;
-- DROP FUNCTION IF EXISTS public.record_monetization_event(uuid, text, text, text, text, text, integer, integer, text, integer);
-- DROP TABLE IF EXISTS public.monetization_events;
-- ===============================================
