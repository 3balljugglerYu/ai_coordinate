-- サブスクの付与の関数を1つにし、請求1件につき売上は1行だけにする
--   計画: docs/planning/subscription-change-revenue-recording-plan.md 5章(2026-10-30 ユーザー「根本的に直す」・承認済み)
--
--   ## 引数3つの古い grant_subscription_percoins を消す
--   本番には (uuid, integer, text) と (uuid, integer, text, jsonb DEFAULT '{}') の2つがあり、
--   引数3つで呼ぶと「どちらか決まらない」(42725: is not unique)で毎回失敗していた。
--   引数3つで呼んでいたのは、change-service.ts(アプリでのプランの引き上げの差)と
--   grant_due_yearly_subscription_percoins(年額の毎月の付与)。古い方を消すと、どちらも
--   引数4つの版(p_metadata は既定値 '{}')に決まる。付与の中身は2つとも同じ。
--
--   サブスクの売上は、付与の行(grant_subscription_percoins・metadata.revenueYen)に載せて記録している。
--   付与の行に売上が載らないとき(無料のペルコインが上限で付与が0・同じ請求の付与が先にある)は、
--   支払いだけの行(record_subscription_payment・payment:<請求 ID>・量0)で記録する。
--   この2つを別々に決めると、Stripe の送り直しの間に状態が変わったとき、同じ請求の売上が二重になる
--   (1回目は上限で支払いだけの行・2回目は上限を下回って付与の行にも売上)。
--
--   そこで、どちらの関数も同じロック(pg_advisory_xact_lock('subscription:<人>:<請求 ID>'))の中で、
--   「その請求の売上が、どこかにもうあるか」を見てから書く。
--
--   ## grant_subscription_percoins(p_user_id, p_amount, p_invoice_id, p_metadata)(webhook が使う版)
--   本番の定義に、次だけを足す。付与の量・期限・残高の扱いは変えない。
--   - 付与の行を書くとき、その請求の支払いだけの行がもうあれば、付与の行には売上(revenueYen・revenueSource)を載せない
--   - 付与が0(上限)のとき、または同じ請求の付与の行がもうあるとき、p_metadata に売上があり、
--     その請求の売上がまだどこにも無ければ、支払いだけの行で記録する
--   ※ change-service.ts のプラン変更の差は p_metadata に売上を載せない(支払いは invoice.paid で記録する)
--
--   ## record_subscription_payment(p_user_id, p_invoice_id, p_metadata)
--   同じロックを取り、その請求の付与の行にもう売上があれば書かない(false を返す)。
--   プラン変更の日割りの請求(付与は change-service.ts が売上なしで行う)で使う。
--   付与の関数の中からは、同じロックの中なので insert_subscription_payment_row を直接呼ぶ。

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.grant_subscription_percoins(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.grant_subscription_percoins(p_user_id uuid, p_amount integer, p_invoice_id text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_existing_transaction_count integer;
  v_grant_amount integer;
  v_tx_id uuid;
  v_expire_at timestamptz;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_has_revenue boolean;
  v_payment_exists boolean;
  v_grant_has_revenue boolean;
begin
  if p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('subscription:' || p_user_id::text || ':' || coalesce(p_invoice_id, ''))
  );

  -- この請求の売上がもうどこかにあるか(支払いだけの行・付与の行)
  v_has_revenue := jsonb_typeof(v_metadata->'revenueYen') = 'number';
  v_payment_exists := p_invoice_id is not null and exists (
    select 1 from public.credit_transactions
    where stripe_payment_intent_id = 'payment:' || p_invoice_id
  );

  select count(*), coalesce(bool_or(jsonb_typeof(metadata->'revenueYen') = 'number'), false)
  into v_existing_transaction_count, v_grant_has_revenue
  from public.credit_transactions
  where user_id = p_user_id
    and transaction_type = 'subscription'
    and stripe_payment_intent_id = p_invoice_id;

  if v_existing_transaction_count > 0 then
    -- 同じ請求の付与がもうある(change-service.ts が売上なしで先に付けた、など)。
    -- 売上がまだどこにも無ければ、支払いだけの行で残す
    if v_has_revenue and not v_payment_exists and not v_grant_has_revenue then
      perform public.insert_subscription_payment_row(p_user_id, p_invoice_id, v_metadata);
    end if;
    return 0;
  end if;

  v_grant_amount := public.get_grantable_free_percoin_amount(p_user_id, p_amount);

  if v_grant_amount <= 0 then
    -- 無料のペルコインが上限で付けられない。お金は払われているので、売上は支払いだけの行で残す
    if v_has_revenue and not v_payment_exists then
      perform public.insert_subscription_payment_row(p_user_id, p_invoice_id, v_metadata);
    end if;
    return 0;
  end if;

  -- 売上がもう支払いだけの行にあれば、付与の行には載せない(二重に数えない)
  if v_payment_exists then
    v_metadata := (v_metadata - 'revenueYen' - 'revenueSource')
      || jsonb_build_object('revenueRecordedOnPayment', true);
  end if;

  v_expire_at := (
    date_trunc('month', now() at time zone 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) at time zone 'Asia/Tokyo';

  insert into public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    stripe_payment_intent_id,
    metadata
  )
  values (
    p_user_id,
    v_grant_amount,
    'subscription',
    p_invoice_id,
    v_metadata || jsonb_build_object(
      'invoice_id', p_invoice_id,
      'requested_amount', p_amount,
      'granted_amount', v_grant_amount,
      'granted_at', now()
    )
  )
  returning id into v_tx_id;

  insert into public.free_percoin_batches (
    user_id,
    amount,
    remaining_amount,
    granted_at,
    expire_at,
    source,
    credit_transaction_id
  )
  values (
    p_user_id,
    v_grant_amount,
    v_grant_amount,
    now(),
    v_expire_at,
    'subscription',
    v_tx_id
  );

  insert into public.user_credits (user_id, balance, paid_balance)
  values (p_user_id, v_grant_amount, 0)
  on conflict (user_id) do update
  set balance = public.user_credits.balance + v_grant_amount,
      updated_at = now();

  return v_grant_amount;
end;
$function$;

-- 支払いだけの行を1行書く(中だけで使う・ロックは呼ぶ側が取る)。書けたら true
CREATE OR REPLACE FUNCTION public.insert_subscription_payment_row(
  p_user_id uuid,
  p_invoice_id text,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    stripe_payment_intent_id,
    metadata
  )
  VALUES (
    p_user_id,
    0,
    'subscription',
    'payment:' || p_invoice_id,
    COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object('paymentOnly', true, 'invoiceId', p_invoice_id, 'invoice_id', p_invoice_id)
  )
  ON CONFLICT (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.insert_subscription_payment_row(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_subscription_payment_row(uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.insert_subscription_payment_row(uuid, text, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.insert_subscription_payment_row(uuid, text, jsonb) FROM service_role;

CREATE OR REPLACE FUNCTION public.record_subscription_payment(
  p_user_id uuid,
  p_invoice_id text,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_invoice_id IS NULL OR btrim(p_invoice_id) = '' THEN
    RAISE EXCEPTION 'record_subscription_payment: user and invoice are required';
  END IF;

  -- 付与の関数と同じロック(この請求の売上を1行だけにする)
  PERFORM pg_advisory_xact_lock(
    hashtext('subscription:' || p_user_id::text || ':' || p_invoice_id)
  );

  -- 付与の行にもう売上があれば書かない
  IF EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND transaction_type = 'subscription'
      AND stripe_payment_intent_id = p_invoice_id
      AND jsonb_typeof(metadata->'revenueYen') = 'number'
  ) THEN
    RETURN false;
  END IF;

  RETURN public.insert_subscription_payment_row(p_user_id, p_invoice_id, p_metadata);
END;
$function$;

COMMENT ON FUNCTION public.record_subscription_payment(uuid, text, jsonb) IS
  'サブスクの請求の支払いだけを記録する(量0の subscription・paymentOnly)。付与の行に売上が載らないとき(プラン変更の日割り・上限で付与0・付与が先にある)に使う。同じ請求の売上は1行だけ。service_role のみ。';

COMMIT;

NOTIFY pgrst, 'reload schema';
