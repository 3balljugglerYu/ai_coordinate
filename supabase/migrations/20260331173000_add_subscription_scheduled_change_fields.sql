alter table public.user_subscriptions
add column if not exists scheduled_plan text
  check (
    scheduled_plan is null
    or scheduled_plan = any (array['light'::text, 'standard'::text, 'premium'::text])
  ),
add column if not exists scheduled_billing_interval text
  check (
    scheduled_billing_interval is null
    or scheduled_billing_interval = any (array['month'::text, 'year'::text])
  ),
add column if not exists scheduled_change_at timestamptz;
