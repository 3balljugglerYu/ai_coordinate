alter table public.user_subscriptions
add column if not exists last_percoin_grant_at timestamptz,
add column if not exists next_percoin_grant_at timestamptz;

create index if not exists idx_user_subscriptions_next_percoin_grant_at
on public.user_subscriptions (next_percoin_grant_at)
where billing_interval = 'year'
  and status = any (array['trialing'::text, 'active'::text])
  and next_percoin_grant_at is not null;

create or replace function public.get_subscription_monthly_percoins_for_plan(
  p_plan text
)
returns integer
language sql
immutable
as $function$
  select case coalesce(p_plan, 'free')
    when 'light' then 400
    when 'standard' then 1200
    when 'premium' then 3000
    else 0
  end
$function$;

create or replace function public.grant_due_yearly_subscription_percoins()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_subscription record;
  v_grant_at timestamptz;
  v_next_grant_at timestamptz;
  v_invoice_id text;
  v_processed_count integer := 0;
begin
  for v_subscription in
    select
      user_id,
      stripe_subscription_id,
      plan,
      current_period_end,
      next_percoin_grant_at
    from public.user_subscriptions
    where billing_interval = 'year'
      and status = any (array['trialing'::text, 'active'::text])
      and next_percoin_grant_at is not null
      and next_percoin_grant_at <= now()
    for update skip locked
  loop
    v_grant_at := v_subscription.next_percoin_grant_at;

    while v_grant_at is not null
      and v_grant_at <= now()
      and (
        v_subscription.current_period_end is null
        or v_grant_at < v_subscription.current_period_end
      )
    loop
      v_invoice_id := format(
        'yearly-monthly:%s:%s',
        coalesce(v_subscription.stripe_subscription_id, v_subscription.user_id::text),
        to_char(v_grant_at at time zone 'UTC', 'YYYYMMDDHH24MISS')
      );

      perform public.grant_subscription_percoins(
        v_subscription.user_id,
        public.get_subscription_monthly_percoins_for_plan(v_subscription.plan),
        v_invoice_id
      );

      v_processed_count := v_processed_count + 1;
      v_next_grant_at := v_grant_at + interval '1 month';

      update public.user_subscriptions
      set last_percoin_grant_at = v_grant_at,
          next_percoin_grant_at = case
            when current_period_end is not null and v_next_grant_at >= current_period_end
              then null
            else v_next_grant_at
          end,
          updated_at = now()
      where user_id = v_subscription.user_id;

      if v_subscription.current_period_end is not null and v_next_grant_at >= v_subscription.current_period_end then
        v_grant_at := null;
      else
        v_grant_at := v_next_grant_at;
      end if;
    end loop;
  end loop;

  return v_processed_count;
end;
$function$;

update public.user_subscriptions
set
  last_percoin_grant_at = case
    when billing_interval = 'year'
      and status = any (array['trialing'::text, 'active'::text])
      and current_period_start is not null
      then coalesce(last_percoin_grant_at, current_period_start)
    else null
  end,
  next_percoin_grant_at = case
    when billing_interval = 'year'
      and status = any (array['trialing'::text, 'active'::text])
      and current_period_start is not null
      and current_period_end is not null
      and (current_period_start + interval '1 month') < current_period_end
      then coalesce(next_percoin_grant_at, current_period_start + interval '1 month')
    when billing_interval = 'year'
      and status = any (array['trialing'::text, 'active'::text])
      then next_percoin_grant_at
    else null
  end;

do $do$
declare
  v_existing_job_id bigint;
begin
  select jobid
  into v_existing_job_id
  from cron.job
  where jobname = 'grant_yearly_subscription_percoins_every_10m'
  limit 1;

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  perform cron.schedule(
    'grant_yearly_subscription_percoins_every_10m',
    '*/10 * * * *',
    $cron$select public.grant_due_yearly_subscription_percoins();$cron$
  );
end;
$do$;
