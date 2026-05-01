create or replace function public.grant_subscription_percoins(
  p_user_id uuid,
  p_amount integer,
  p_invoice_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing_transaction_count integer;
  v_grant_amount integer;
  v_tx_id uuid;
  v_expire_at timestamptz;
begin
  if p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('subscription:' || p_user_id::text || ':' || coalesce(p_invoice_id, ''))
  );

  select count(*)
  into v_existing_transaction_count
  from public.credit_transactions
  where user_id = p_user_id
    and transaction_type = 'subscription'
    and stripe_payment_intent_id = p_invoice_id;

  if v_existing_transaction_count > 0 then
    return 0;
  end if;

  v_grant_amount := public.get_grantable_free_percoin_amount(p_user_id, p_amount);

  if v_grant_amount <= 0 then
    return 0;
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
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
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

revoke all on function public.grant_subscription_percoins(uuid, integer, text)
from public, anon, authenticated;

revoke all on function public.grant_subscription_percoins(uuid, integer, text, jsonb)
from public, anon, authenticated;

grant execute on function public.grant_subscription_percoins(uuid, integer, text)
to service_role;

grant execute on function public.grant_subscription_percoins(uuid, integer, text, jsonb)
to service_role;
