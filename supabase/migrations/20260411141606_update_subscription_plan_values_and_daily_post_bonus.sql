-- Align monetization settings with the 2026-04-11 business policy.
-- This migration updates:
-- - daily_post default bonus amount to 15
-- - subscription bonus multipliers to 1.1 / 1.3 / 1.5
-- - yearly plan monthly grant amounts to 300 / 1000 / 2500

insert into public.percoin_bonus_defaults (source, amount)
values ('daily_post', 15)
on conflict (source) do update
set amount = excluded.amount,
    updated_at = now();

create or replace function public.get_percoin_bonus_default(p_source text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount integer;
begin
  select amount into v_amount
  from percoin_bonus_defaults
  where source = p_source;

  if v_amount is null then
    v_amount := case p_source
      when 'signup_bonus' then 50
      when 'tour_bonus' then 20
      when 'referral' then 100
      when 'daily_post' then 15
      else 0
    end;
  end if;

  return v_amount;
end;
$$;

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
    when 'light' then 1.1
    when 'standard' then 1.3
    when 'premium' then 1.5
    else 1.0
  end;
end;
$function$;

create or replace function public.get_subscription_monthly_percoins_for_plan(
  p_plan text
)
returns integer
language sql
immutable
as $function$
  select case coalesce(p_plan, 'free')
    when 'light' then 300
    when 'standard' then 1000
    when 'premium' then 2500
    else 0
  end
$function$;
