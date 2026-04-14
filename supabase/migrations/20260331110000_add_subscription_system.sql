create table public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'free'
    check (plan = any (array['free'::text, 'light'::text, 'standard'::text, 'premium'::text])),
  status text not null default 'inactive'
    check (
      status = any (
        array[
          'trialing'::text,
          'active'::text,
          'past_due'::text,
          'canceled'::text,
          'incomplete'::text,
          'incomplete_expired'::text,
          'unpaid'::text,
          'paused'::text,
          'inactive'::text
        ]
      )
    ),
  billing_interval text
    check (billing_interval is null or billing_interval = any (array['month'::text, 'year'::text])),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_subscriptions enable row level security;

create policy "user_subscriptions_select_own"
  on public.user_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

create trigger update_user_subscriptions_updated_at
before update on public.user_subscriptions
for each row
execute function public.update_updated_at_column();

update public.profiles
set subscription_plan = case subscription_plan
  when 'plan_a' then 'light'
  when 'plan_b' then 'standard'
  when 'plan_c' then 'premium'
  else subscription_plan
end
where subscription_plan in ('plan_a', 'plan_b', 'plan_c');

alter table public.profiles
drop constraint if exists profiles_subscription_plan_check;

alter table public.profiles
add constraint profiles_subscription_plan_check
check (
  subscription_plan = any (array['free'::text, 'light'::text, 'standard'::text, 'premium'::text])
);

alter table public.credit_transactions
drop constraint if exists credit_transactions_transaction_type_check;

alter table public.credit_transactions
add constraint credit_transactions_transaction_type_check
check (
  transaction_type = any (
    array[
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
      'subscription'::text
    ]
  )
);

alter table public.free_percoin_batches
drop constraint if exists free_percoin_batches_source_check;

alter table public.free_percoin_batches
add constraint free_percoin_batches_source_check
check (
  source = any (
    array[
      'signup_bonus'::text,
      'tour_bonus'::text,
      'referral'::text,
      'daily_post'::text,
      'streak'::text,
      'admin_bonus'::text,
      'refund'::text,
      'subscription'::text
    ]
  )
);

create or replace function public.get_stock_image_limit_for_plan(p_plan text)
returns integer
language sql
immutable
as $function$
  select case coalesce(p_plan, 'free')
    when 'light' then 5
    when 'standard' then 10
    when 'premium' then 30
    else 2
  end
$function$;

create or replace function public.get_subscription_bonus_multiplier(p_user_id uuid)
returns numeric
language plpgsql
set search_path to 'public'
as $function$
declare
  v_plan text;
begin
  select subscription_plan
  into v_plan
  from public.profiles
  where user_id = p_user_id;

  return case coalesce(v_plan, 'free')
    when 'light' then 1.2
    when 'standard' then 1.5
    when 'premium' then 2.0
    else 1.0
  end;
end;
$function$;

create or replace function public.get_grantable_free_percoin_amount(
  p_user_id uuid,
  p_requested_amount integer
)
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_cap constant integer := 50000;
  v_free_balance integer;
begin
  if p_requested_amount is null or p_requested_amount <= 0 then
    return 0;
  end if;

  select greatest(coalesce(balance, 0) - coalesce(paid_balance, 0), 0)
  into v_free_balance
  from public.user_credits
  where user_id = p_user_id;

  return greatest(least(p_requested_amount, v_cap - coalesce(v_free_balance, 0)), 0);
end;
$function$;

create or replace function public.sync_profile_subscription_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_effective_plan text;
begin
  v_user_id := coalesce(new.user_id, old.user_id);

  if v_user_id is null then
    return coalesce(new, old);
  end if;

  select case
    when status = any (array['trialing'::text, 'active'::text]) then plan
    else 'free'
  end
  into v_effective_plan
  from public.user_subscriptions
  where user_id = v_user_id;

  update public.profiles
  set subscription_plan = coalesce(v_effective_plan, 'free'),
      updated_at = now()
  where user_id = v_user_id;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists sync_profile_subscription_plan_on_user_subscriptions
on public.user_subscriptions;

create trigger sync_profile_subscription_plan_on_user_subscriptions
after insert or update or delete on public.user_subscriptions
for each row
execute function public.sync_profile_subscription_plan();

create or replace function public.grant_subscription_percoins(
  p_user_id uuid,
  p_amount integer,
  p_invoice_id text
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
    jsonb_build_object(
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

grant execute on function public.grant_subscription_percoins(uuid, integer, text)
to service_role;

create or replace function public.get_stock_image_limit()
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_plan text;
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return 0;
  end if;

  select subscription_plan
  into v_plan
  from public.profiles
  where user_id = v_user_id;

  return public.get_stock_image_limit_for_plan(v_plan);
end;
$function$;

create or replace function public.grant_daily_post_bonus(
  p_user_id uuid,
  p_generation_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing_transaction_count integer;
  v_last_bonus_at timestamptz;
  v_current_jst_date date;
  v_last_bonus_jst_date date;
  v_base_bonus_amount integer;
  v_bonus_multiplier numeric;
  v_requested_bonus_amount integer;
  v_grant_amount integer;
  v_notification_id uuid;
  v_tx_id uuid;
  v_expire_at timestamptz;
begin
  v_base_bonus_amount := public.get_percoin_bonus_default('daily_post');

  select count(*)
  into v_existing_transaction_count
  from public.credit_transactions
  where related_generation_id = p_generation_id
    and transaction_type = 'daily_post'
    and user_id = p_user_id;

  if v_existing_transaction_count > 0 then
    return 0;
  end if;

  v_current_jst_date := (current_timestamp at time zone 'Asia/Tokyo')::date;

  select last_daily_post_bonus_at
  into v_last_bonus_at
  from public.profiles
  where user_id = p_user_id;

  if v_last_bonus_at is not null then
    v_last_bonus_jst_date := (v_last_bonus_at at time zone 'Asia/Tokyo')::date;
  end if;

  if v_last_bonus_at is not null and v_last_bonus_jst_date >= v_current_jst_date then
    return 0;
  end if;

  v_bonus_multiplier := public.get_subscription_bonus_multiplier(p_user_id);
  v_requested_bonus_amount := ceil(v_base_bonus_amount * v_bonus_multiplier)::integer;
  v_grant_amount := public.get_grantable_free_percoin_amount(
    p_user_id,
    v_requested_bonus_amount
  );

  update public.profiles
  set last_daily_post_bonus_at = now(),
      updated_at = now()
  where user_id = p_user_id;

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
    related_generation_id,
    metadata
  )
  values (
    p_user_id,
    v_grant_amount,
    'daily_post',
    p_generation_id,
    jsonb_build_object(
      'posted_at', now(),
      'base_bonus_amount', v_base_bonus_amount,
      'bonus_multiplier', v_bonus_multiplier,
      'requested_bonus_amount', v_requested_bonus_amount,
      'granted_bonus_amount', v_grant_amount
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
    'daily_post',
    v_tx_id
  );

  insert into public.user_credits (user_id, balance, paid_balance)
  values (p_user_id, v_grant_amount, 0)
  on conflict (user_id) do update
  set balance = public.user_credits.balance + v_grant_amount,
      updated_at = now();

  insert into public.notifications (
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
  values (
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
      'base_bonus_amount', v_base_bonus_amount,
      'bonus_multiplier', v_bonus_multiplier
    ),
    false,
    now()
  )
  returning id into v_notification_id;

  return v_grant_amount;
end;
$function$;

create or replace function public.grant_streak_bonus(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing_transaction_count integer;
  v_last_login_at timestamptz;
  v_current_jst_date date;
  v_last_login_jst_date date;
  v_streak_days integer;
  v_new_streak_days integer;
  v_base_bonus_amount integer;
  v_bonus_multiplier numeric;
  v_requested_bonus_amount integer;
  v_grant_amount integer;
  v_notification_id uuid;
  v_tx_id uuid;
  v_expire_at timestamptz;
begin
  select count(*)
  into v_existing_transaction_count
  from public.credit_transactions
  where user_id = p_user_id
    and transaction_type = 'streak'
    and (created_at at time zone 'Asia/Tokyo')::date =
      (current_timestamp at time zone 'Asia/Tokyo')::date;

  if v_existing_transaction_count > 0 then
    return 0;
  end if;

  v_current_jst_date := (current_timestamp at time zone 'Asia/Tokyo')::date;

  select last_streak_login_at, streak_days
  into v_last_login_at, v_streak_days
  from public.profiles
  where user_id = p_user_id;

  if v_last_login_at is not null then
    v_last_login_jst_date := (v_last_login_at at time zone 'Asia/Tokyo')::date;
  end if;

  if v_last_login_at is null then
    v_new_streak_days := 1;
  elsif v_last_login_jst_date < v_current_jst_date then
    if v_last_login_jst_date = v_current_jst_date - 1 then
      v_new_streak_days := coalesce(v_streak_days, 0) + 1;
      if v_new_streak_days > 14 then
        v_new_streak_days := 1;
      end if;
    else
      v_new_streak_days := 1;
    end if;
  else
    return 0;
  end if;

  v_base_bonus_amount := public.get_percoin_streak_amount(v_new_streak_days);

  update public.profiles
  set last_streak_login_at = now(),
      streak_days = v_new_streak_days,
      updated_at = now()
  where user_id = p_user_id;

  if v_base_bonus_amount = 0 then
    return 0;
  end if;

  v_bonus_multiplier := public.get_subscription_bonus_multiplier(p_user_id);
  v_requested_bonus_amount := ceil(v_base_bonus_amount * v_bonus_multiplier)::integer;
  v_grant_amount := public.get_grantable_free_percoin_amount(
    p_user_id,
    v_requested_bonus_amount
  );

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
    metadata
  )
  values (
    p_user_id,
    v_grant_amount,
    'streak',
    jsonb_build_object(
      'streak_days', v_new_streak_days,
      'login_at', now(),
      'base_bonus_amount', v_base_bonus_amount,
      'bonus_multiplier', v_bonus_multiplier,
      'requested_bonus_amount', v_requested_bonus_amount,
      'granted_bonus_amount', v_grant_amount
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
    'streak',
    v_tx_id
  );

  insert into public.user_credits (user_id, balance, paid_balance)
  values (p_user_id, v_grant_amount, 0)
  on conflict (user_id) do update
  set balance = public.user_credits.balance + v_grant_amount,
      updated_at = now();

  insert into public.notifications (
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
  values (
    p_user_id,
    p_user_id,
    'bonus',
    'user',
    p_user_id,
    '連続ログイン特典獲得！',
    v_new_streak_days || '日連続ログインで' || v_grant_amount || 'ペルコインを獲得しました！',
    jsonb_build_object(
      'bonus_amount', v_grant_amount,
      'bonus_type', 'streak',
      'streak_days', v_new_streak_days,
      'login_at', now(),
      'base_bonus_amount', v_base_bonus_amount,
      'bonus_multiplier', v_bonus_multiplier
    ),
    false,
    now()
  )
  returning id into v_notification_id;

  return v_grant_amount;
end;
$function$;

create or replace function public.insert_source_image_stock(
  p_user_id uuid,
  p_image_url text,
  p_storage_path text,
  p_name text
)
returns public.source_image_stocks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit integer;
  v_count bigint;
  v_record public.source_image_stocks;
  v_plan text;
begin
  if (select auth.uid()) is distinct from p_user_id then
    raise exception '権限がありません';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select subscription_plan
  into v_plan
  from public.profiles
  where user_id = p_user_id;

  v_limit := public.get_stock_image_limit_for_plan(v_plan);

  select count(*)
  into v_count
  from public.source_image_stocks
  where user_id = p_user_id
    and deleted_at is null;

  if v_count >= v_limit then
    raise exception 'ストック画像の上限（%枚）に達しています。不要なストックを削除するか、プランをアップグレードしてください。', v_limit;
  end if;

  insert into public.source_image_stocks (user_id, image_url, storage_path, name)
  values (p_user_id, p_image_url, p_storage_path, p_name)
  returning * into v_record;

  return v_record;
end;
$function$;
