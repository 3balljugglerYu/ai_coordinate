BEGIN;

/*
  管理ダッシュボード P3(記録を取り始める)の DB。
  計画: docs/planning/admin-growth-p3-instrumentation-plan.md(4章・5章・7章)

  1. monetization_events: 課金の手前の出来事
     (足りなくなった・購入画面を見た・支払いを始めた・期限切れ)
  2. record_monetization_event: 書き込みの入口(回数の上限・重複の防止つき)

  流入元の列(profiles.first_visit_channel など)と登録の時のトリガーの直しは、
  値を書く側と一緒に P3-3 で出す(使われないまま、新規登録のたびに動くトリガーを変えないため)。

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
-- ⭐ 上限をかけるのは「足りなくなった」「購入画面を見た」だけ(画面から何度でも送れるもの)。
--    支払いの開始・期限切れは、支払い画面ごとに1回しか来ないので、必ず書く(上限で落とすと、
--    開始のない期限切れや、期限切れのない開始ができて、流れを結べなくなる)。
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

  IF p_event_type IN ('percoin_shortage', 'purchase_view') THEN
    PERFORM pg_advisory_xact_lock(hashtext('monetization_event:' || p_user_id::text));

    SELECT count(*) INTO v_recent
    FROM public.monetization_events e
    WHERE e.user_id = p_user_id
      AND e.event_type IN ('percoin_shortage', 'purchase_view')
      AND e.created_at > now() - interval '1 minute';

    IF v_recent >= greatest(coalesce(p_max_per_minute, 10), 0) THEN
      RETURN false;
    END IF;
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

COMMIT;

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.record_monetization_event(uuid, text, text, text, text, text, integer, integer, text, integer);
-- DROP TABLE IF EXISTS public.monetization_events;
-- ===============================================
