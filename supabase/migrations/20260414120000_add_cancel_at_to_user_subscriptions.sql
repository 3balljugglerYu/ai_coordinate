-- Stripe Billing Portal cancellations set the `cancel_at` timestamp on the
-- subscription (and leave `cancel_at_period_end` = false). Persist it so the
-- app can show pending cancellations without round-tripping to Stripe.

alter table public.user_subscriptions
add column if not exists cancel_at timestamptz;
