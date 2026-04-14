-- Fix two issues from code review of the yearly subscription grant system:
-- 1. Monthly percoin amounts were 400/1200/3000 but docs/business/monetization.md
--    specifies 300/1000/2500.
-- 2. grant_due_yearly_subscription_percoins() had no explicit revoke/grant,
--    leaving it callable by authenticated users via PostgREST.

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

revoke all on function public.grant_due_yearly_subscription_percoins()
from public, anon, authenticated;

grant execute on function public.grant_due_yearly_subscription_percoins()
to service_role;
