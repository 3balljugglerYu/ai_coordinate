-- サブスクの請求の売上を、付与の行に寄せる(#828 の /code-review の直し)
--   計画: docs/planning/subscription-change-revenue-recording-plan.md 5章
--
--   20261030140000 では、支払いだけの行(payment:<請求 ID>)が先にあると、あとから書く付与の行から
--   売上(revenueYen)を外していた。管理画面の「買った量」(get_percoin_daily_flow の purchased)は
--   「本番のサブスクで revenueYen がある付与の行」の量なので、その付与のペルコインが買った量から消えていた。
--   (上限で付与が0 → 支払いだけの行 → 残高が下がってから同じ請求の送り直し、のときだけ起きる)
--
--   ## grant_subscription_percoins(引数4つ)
--   20261030140000 の定義に、次だけを変える。付与の量・期限・残高の扱いは変えない。
--   - 付与の行を書くとき、その請求の支払いだけの行に売上があれば、売上は付与の行に載せ、
--     支払いだけの行からは外す(revenueMovedToGrant)。売上は1行のまま
--   - 0円の請求は売上として残さない(支払いだけの行を書かない)
--
--   ## insert_subscription_payment_row
--   請求 ID が無いときは書かない('payment:' || null は NULL になり、一意の索引が効かないため)。

BEGIN;

SET LOCAL lock_timeout = '5s';

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

  -- この請求の売上がもうどこかにあるか(支払いだけの行・付与の行)。
  -- 0円の請求は売上として残さない(アプリの recordSubscriptionChangePayment と同じ決まり)
  v_has_revenue := jsonb_typeof(v_metadata->'revenueYen') = 'number'
    and (v_metadata->>'revenueYen')::numeric > 0;
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

  -- 支払いだけの行に売上が先にあれば(上限で付与が0だったあとの送り直し)、売上を付与の行に寄せ、
  -- 支払いだけの行からは外す。売上は1行のまま、付いたペルコインは「買った量」に入る
  -- (get_percoin_daily_flow は「本番のサブスクで revenueYen がある付与の行」の量を買った量に数える)
  if v_has_revenue and v_payment_exists then
    update public.credit_transactions
    set metadata = (metadata - 'revenueYen' - 'revenueSource')
      || jsonb_build_object('revenueMovedToGrant', true)
    where stripe_payment_intent_id = 'payment:' || p_invoice_id
      and jsonb_typeof(metadata->'revenueYen') = 'number';
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
  IF p_invoice_id IS NULL OR btrim(p_invoice_id) = '' THEN
    RETURN false;
  END IF;

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

COMMIT;

NOTIFY pgrst, 'reload schema';
